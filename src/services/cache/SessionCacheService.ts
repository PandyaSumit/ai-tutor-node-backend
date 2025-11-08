import { LRUCache } from 'lru-cache';
import os from 'os';
import RedisService from '../external/RedisService';
import SessionService from '../session/SessionService';
import logger from '@/config/logger';
import { ISession } from '@/models/Session';
import mongoose from 'mongoose';

interface CachedSession {
    sessionId: string;
    userId: string;
    status: string;
    contextWindow: any;
    metadata: any;
    cachedAt: number;
}

export class SessionCacheService {
    private memoryCache: LRUCache<string, CachedSession>;
    private redisService: RedisService;
    private sessionService: SessionService;
    private readonly REDIS_TTL = 3600; // 1 hour
    private readonly MEMORY_TTL = 300000; // 5 minutes

    constructor() {
        // ✅ Calculate max cache size based on available memory
        const availableMemory = os.freemem();
        const estimatedSessionSize = 10 * 1024; // 10KB per session
        const maxCacheSize = Math.min(
            10000, // Hard limit
            Math.max(
                1000, // Minimum limit
                Math.floor((availableMemory * 0.1) / estimatedSessionSize) // Use 10% of free memory
            )
        );

        // L1 Cache: In-memory (fastest)
        this.memoryCache = new LRUCache({
            max: maxCacheSize,
            ttl: this.MEMORY_TTL,
            updateAgeOnGet: true,
            updateAgeOnHas: false,
            // ✅ Add disposal callback for monitoring
            dispose: (value, key) => {
                logger.debug(`Evicted session ${key} from L1 cache`);
            }
        });

        // L2 Cache: Redis (shared across instances)
        this.redisService = new RedisService();
        this.sessionService = new SessionService();

        logger.info(`✅ Session cache initialized with max size: ${maxCacheSize}`, {
            availableMemoryMB: Math.round(availableMemory / 1024 / 1024),
            estimatedSessionSizeKB: estimatedSessionSize / 1024,
            maxCacheSize
        });
    }

    /**
     * Get session with multi-tier caching
     * L1: Memory -> L2: Redis -> L3: Database
     */
    async getSession(sessionId: string): Promise<ISession | null> {
        try {
            // ✅ Validate sessionId format
            if (!sessionId || typeof sessionId !== 'string') {
                logger.warn('Invalid sessionId provided to cache', { sessionId });
                return null;
            }

            // L1: Check memory cache
            const memCached = this.memoryCache.get(sessionId);
            if (memCached) {
                logger.debug(`📦 Session ${sessionId} hit L1 cache`);
                return this.deserializeSession(memCached);
            }

            // L2: Check Redis
            const redisCached = await this.redisService.getCached(`session:${sessionId}`);
            if (redisCached) {
                logger.debug(`📦 Session ${sessionId} hit L2 cache (Redis)`);

                // Populate L1 cache
                this.memoryCache.set(sessionId, {
                    ...redisCached,
                    cachedAt: Date.now()
                });

                return this.deserializeSession(redisCached);
            }

            // L3: Fetch from database
            logger.debug(`💾 Session ${sessionId} cache miss, fetching from DB`);
            const session = await this.sessionService.getSession(sessionId);

            if (session) {
                await this.setSession(sessionId, session);
            }

            return session;

        } catch (error) {
            logger.error('❌ Error getting cached session', { sessionId, error });
            // Fallback to direct DB query
            try {
                return await this.sessionService.getSession(sessionId);
            } catch (fallbackError) {
                logger.error('❌ Fallback DB query failed', { sessionId, fallbackError });
                return null;
            }
        }
    }

    /**
     * Set session in all cache tiers
     */
    async setSession(sessionId: string, session: ISession): Promise<void> {
        try {
            const cached: CachedSession = {
                sessionId: session.sessionId,
                userId: session.userId.toString(),
                status: session.status,
                contextWindow: session.contextWindow,
                metadata: session.metadata,
                cachedAt: Date.now()
            };

            // Set in L1 (memory)
            this.memoryCache.set(sessionId, cached);
            logger.debug(`✅ Cached session ${sessionId} in L1`);

            // Set in L2 (Redis) - non-blocking
            this.redisService.cache(`session:${sessionId}`, cached, this.REDIS_TTL)
                .then(() => logger.debug(`✅ Cached session ${sessionId} in L2 (Redis)`))
                .catch(err => logger.error('❌ Failed to cache session in Redis', { sessionId, err }));

        } catch (error) {
            logger.error('❌ Error setting session in cache', { sessionId, error });
        }
    }

    /**
     * Update session context without full reload
     * ✅ FIXED: Better error handling and validation
     */
    async updateSessionContext(
        sessionId: string,
        newMessage: { role: string; content: string; timestamp: Date }
    ): Promise<void> {
        try {
            // ✅ Validate message
            if (!newMessage || !newMessage.role || !newMessage.content) {
                logger.warn('Invalid message data for context update', { sessionId, newMessage });
                return;
            }

            // Update L1 cache
            const cached = this.memoryCache.get(sessionId);
            if (cached) {
                // ✅ Ensure messages array exists
                if (!cached.contextWindow.messages) {
                    cached.contextWindow.messages = [];
                }

                cached.contextWindow.messages.push(newMessage);
                cached.metadata.lastActivity = new Date();
                cached.metadata.messageCount = (cached.metadata.messageCount || 0) + 1;
                cached.cachedAt = Date.now();

                // Keep only last 20 messages in cache
                if (cached.contextWindow.messages.length > 20) {
                    cached.contextWindow.messages = cached.contextWindow.messages.slice(-20);
                }

                this.memoryCache.set(sessionId, cached);
                logger.debug(`✅ Updated session ${sessionId} context in L1 cache`);
            }

            // Update L2 (Redis) - non-blocking
            this.redisService.getCached(`session:${sessionId}`)
                .then(async (redisCached) => {
                    if (redisCached) {
                        // ✅ Ensure messages array exists
                        if (!redisCached.contextWindow.messages) {
                            redisCached.contextWindow.messages = [];
                        }

                        redisCached.contextWindow.messages.push(newMessage);
                        redisCached.metadata.lastActivity = new Date();
                        redisCached.metadata.messageCount = (redisCached.metadata.messageCount || 0) + 1;

                        // Keep only last 20 messages
                        if (redisCached.contextWindow.messages.length > 20) {
                            redisCached.contextWindow.messages = redisCached.contextWindow.messages.slice(-20);
                        }

                        await this.redisService.cache(
                            `session:${sessionId}`,
                            redisCached,
                            this.REDIS_TTL
                        );

                        logger.debug(`✅ Updated session ${sessionId} context in L2 (Redis)`);
                    }
                })
                .catch(err => logger.error('❌ Failed to update session in Redis', { sessionId, err }));

        } catch (error) {
            logger.error('❌ Error updating session context', { sessionId, error });
        }
    }

    /**
     * Invalidate session from all caches
     */
    async invalidateSession(sessionId: string): Promise<void> {
        try {
            // Remove from L1
            const deleted = this.memoryCache.delete(sessionId);
            logger.debug(`${deleted ? '✅' : 'ℹ️'} Session ${sessionId} ${deleted ? 'removed from' : 'not found in'} L1 cache`);

            // Remove from L2
            await this.redisService.invalidateCache(`session:${sessionId}`)
                .catch(err => logger.error('❌ Failed to invalidate Redis cache', { sessionId, err }));

            logger.info(`🗑️  Session ${sessionId} invalidated from all caches`);
        } catch (error) {
            logger.error('❌ Error invalidating session', { sessionId, error });
        }
    }

    /**
     * Invalidate all sessions for a user
     */
    async invalidateUserSessions(userId: string): Promise<void> {
        try {
            let l1Count = 0;

            // Clear from L1
            for (const [key, value] of this.memoryCache.entries()) {
                if (value.userId === userId) {
                    this.memoryCache.delete(key);
                    l1Count++;
                }
            }

            logger.debug(`✅ Cleared ${l1Count} sessions for user ${userId} from L1 cache`);

            // Clear from L2
            await this.redisService.invalidateCache(`session:*:user:${userId}`)
                .catch(err => logger.error('❌ Failed to invalidate user sessions in Redis', { userId, err }));

            logger.info(`🗑️  Invalidated all sessions for user ${userId}`);
        } catch (error) {
            logger.error('❌ Error invalidating user sessions', { userId, error });
        }
    }

    /**
     * Preload sessions for a user (warming the cache)
     */
    async preloadUserSessions(userId: string): Promise<void> {
        try {
            const sessions = await this.sessionService.getUserSessions(userId, 'active');

            // Preload top 10 active sessions
            const sessionsToPreload = sessions.slice(0, 10);

            for (const session of sessionsToPreload) {
                await this.setSession(session.sessionId, session);
            }

            logger.info(`🔥 Preloaded ${sessionsToPreload.length} sessions for user ${userId}`, {
                total: sessions.length,
                preloaded: sessionsToPreload.length
            });
        } catch (error) {
            logger.error('❌ Error preloading user sessions', { userId, error });
        }
    }

    /**
     * Get cache statistics
     */
    getStats() {
        const size = this.memoryCache.size;
        const max = this.memoryCache.max || 1;

        return {
            l1: {
                size,
                maxSize: max,
                usagePercent: ((size / max) * 100).toFixed(2),
                availableSlots: max - size
            },
            memory: {
                freeMB: Math.round(os.freemem() / 1024 / 1024),
                totalMB: Math.round(os.totalmem() / 1024 / 1024),
                usagePercent: (((os.totalmem() - os.freemem()) / os.totalmem()) * 100).toFixed(2)
            }
        };
    }

    /**
     * Clear all caches (use with caution)
     */
    async clearAll(): Promise<void> {
        try {
            const l1Size = this.memoryCache.size;
            this.memoryCache.clear();
            logger.warn(`⚠️  Cleared ${l1Size} sessions from L1 cache`);

            await this.redisService.invalidateCache('session:*');
            logger.warn('⚠️  Cleared all sessions from L2 (Redis) cache');

            logger.warn('⚠️  All session caches cleared');
        } catch (error) {
            logger.error('❌ Error clearing all caches', error);
        }
    }

    /**
     * ✅ FIXED: Proper deserialization with type safety
     */
    private deserializeSession(cached: CachedSession): ISession {
        // Convert cached data back to ISession format
        return {
            _id: new mongoose.Types.ObjectId(cached.sessionId),
            userId: new mongoose.Types.ObjectId(cached.userId),
            sessionId: cached.sessionId,
            status: cached.status as 'active' | 'paused' | 'ended',
            contextWindow: {
                messages: cached.contextWindow.messages || [],
                maxTokens: cached.contextWindow.maxTokens || 4000
            },
            metadata: {
                startTime: new Date(cached.metadata.startTime),
                lastActivity: new Date(cached.metadata.lastActivity),
                messageCount: cached.metadata.messageCount || 0,
                topic: cached.metadata.topic
            },
            createdAt: new Date(cached.cachedAt),
            updatedAt: new Date(cached.cachedAt)
        } as ISession;
    }
}