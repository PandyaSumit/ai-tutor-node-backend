// src/services/cache/SessionCacheService.ts
import { LRUCache } from 'lru-cache';
import RedisService from '../external/RedisService';
import SessionService from '../session/SessionService';
import logger from '@/config/logger';
import { ISession } from '@/models/Session';

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
        // L1 Cache: In-memory (fastest)
        this.memoryCache = new LRUCache({
            max: 5000,
            ttl: this.MEMORY_TTL,
            updateAgeOnGet: true,
            updateAgeOnHas: false
        });

        // L2 Cache: Redis (shared across instances)
        this.redisService = new RedisService();
        this.sessionService = new SessionService();
    }

    /**
     * Get session with multi-tier caching
     * L1: Memory -> L2: Redis -> L3: Database
     */
    async getSession(sessionId: string): Promise<ISession | null> {
        try {
            // L1: Check memory cache
            const memCached = this.memoryCache.get(sessionId);
            if (memCached) {
                logger.debug(`Session ${sessionId} hit L1 cache`);
                return this.deserializeSession(memCached);
            }

            // L2: Check Redis
            const redisCached = await this.redisService.getCached(`session:${sessionId}`);
            if (redisCached) {
                logger.debug(`Session ${sessionId} hit L2 cache (Redis)`);

                // Populate L1 cache
                this.memoryCache.set(sessionId, {
                    ...redisCached,
                    cachedAt: Date.now()
                });

                return this.deserializeSession(redisCached);
            }

            // L3: Fetch from database
            logger.debug(`Session ${sessionId} cache miss, fetching from DB`);
            const session = await this.sessionService.getSession(sessionId);

            if (session) {
                await this.setSession(sessionId, session);
            }

            return session;

        } catch (error) {
            logger.error('Error getting cached session', { sessionId, error });
            // Fallback to direct DB query
            return this.sessionService.getSession(sessionId);
        }
    }

    /**
     * Set session in all cache tiers
     */
    async setSession(sessionId: string, session: ISession): Promise<void> {
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

        // Set in L2 (Redis) - non-blocking
        this.redisService.cache(`session:${sessionId}`, cached, this.REDIS_TTL)
            .catch(err => logger.error('Failed to cache session in Redis', err));
    }

    /**
     * Update session context without full reload
     */
    async updateSessionContext(
        sessionId: string,
        newMessage: { role: string; content: string; timestamp: Date }
    ): Promise<void> {
        // Update L1 cache
        const cached = this.memoryCache.get(sessionId);
        if (cached) {
            cached.contextWindow.messages.push(newMessage);
            cached.metadata.lastActivity = new Date();
            cached.metadata.messageCount++;
            cached.cachedAt = Date.now();

            // Keep only last 20 messages in cache
            if (cached.contextWindow.messages.length > 20) {
                cached.contextWindow.messages = cached.contextWindow.messages.slice(-20);
            }

            this.memoryCache.set(sessionId, cached);
        }

        this.redisService.getCached(`session:${sessionId}`)
            .then(async (redisCached) => {
                if (redisCached) {
                    redisCached.contextWindow.messages.push(newMessage);
                    redisCached.metadata.lastActivity = new Date();
                    redisCached.metadata.messageCount++;

                    await this.redisService.cache(
                        `session:${sessionId}`,
                        redisCached,
                        this.REDIS_TTL
                    );
                }
            })
            .catch(err => logger.error('Failed to update session in Redis', err));
    }

    /**
     * Invalidate session from all caches
     */
    async invalidateSession(sessionId: string): Promise<void> {
        // Remove from L1
        this.memoryCache.delete(sessionId);

        // Remove from L2
        await this.redisService.invalidateCache(`session:${sessionId}`)
            .catch(err => logger.error('Failed to invalidate Redis cache', err));

        logger.debug(`Session ${sessionId} invalidated from all caches`);
    }

    /**
     * Invalidate all sessions for a user
     */
    async invalidateUserSessions(userId: string): Promise<void> {
        // Clear from L1
        for (const [key, value] of this.memoryCache.entries()) {
            if (value.userId === userId) {
                this.memoryCache.delete(key);
            }
        }

        // Clear from L2
        await this.redisService.invalidateCache(`session:*:user:${userId}`)
            .catch(err => logger.error('Failed to invalidate user sessions', err));
    }

    /**
     * Preload sessions for a user (warming the cache)
     */
    async preloadUserSessions(userId: string): Promise<void> {
        try {
            const sessions = await this.sessionService.getUserSessions(userId, 'active');

            for (const session of sessions.slice(0, 10)) { // Preload top 10 active sessions
                await this.setSession(session.sessionId, session);
            }

            logger.info(`Preloaded ${sessions.length} sessions for user ${userId}`);
        } catch (error) {
            logger.error('Error preloading user sessions', { userId, error });
        }
    }

    /**
     * Get cache statistics
     */
    getStats() {
        return {
            l1: {
                size: this.memoryCache.size,
                maxSize: this.memoryCache.max,
                hitRate: this.memoryCache.calculatedSize / this.memoryCache.max
            }
        };
    }

    /**
     * Clear all caches (use with caution)
     */
    async clearAll(): Promise<void> {
        this.memoryCache.clear();
        await this.redisService.invalidateCache('session:*');
        logger.warn('All session caches cleared');
    }

    private deserializeSession(cached: CachedSession): ISession {
        // Convert cached data back to ISession format
        return {
            _id: cached.sessionId as any,
            userId: cached.userId as any,
            sessionId: cached.sessionId,
            status: cached.status as any,
            contextWindow: cached.contextWindow,
            metadata: cached.metadata,
            createdAt: new Date(),
            updatedAt: new Date()
        } as ISession;
    }
}