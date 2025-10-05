import logger from '@/config/logger';
import { Redis } from 'ioredis';

export default class RedisService {
    private client: Redis;
    private subscriber: Redis;
    private publisher: Redis;

    constructor() {
        const redisConfig = {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD,
            retryStrategy: (times: number) => {
                if (times > 3) {
                    logger.warn('Redis connection failed. Running without Redis.');
                    return null; // Stop retrying
                }
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
            lazyConnect: true // Don't connect immediately
        };

        this.client = new Redis(redisConfig);
        this.subscriber = new Redis(redisConfig);
        this.publisher = new Redis(redisConfig);

        // Attempt connection but don't crash if it fails
        this.client.connect().catch(err => {
            logger.warn('Redis unavailable, some features will be disabled:', err.message);
        });

        this.client.on('connect', () => {
            logger.info('Redis client connected');
        });

        this.client.on('error', (err) => {
            logger.error('Redis client error', err);
        });
    }

    // Session management
    async setSession(sessionId: string, data: any, ttl: number = 3600) {
        await this.client.setex(
            `session:${sessionId}`,
            ttl,
            JSON.stringify(data)
        );
    }

    async getSession(sessionId: string): Promise<any> {
        const data = await this.client.get(`session:${sessionId}`);
        return data ? JSON.parse(data) : null;
    }

    async deleteSession(sessionId: string) {
        await this.client.del(`session:${sessionId}`);
    }

    async getUserSessions(userId: string): Promise<any> {
        const keys = await this.client.keys(`session:*`);
        const sessions: string[] = [];

        for (const key of keys) {
            const data = await this.client.get(key);
            if (data) {
                const session = JSON.parse(data);
                if (session.userId === userId) {
                    sessions.push(key.replace('session:', ''));
                }
            }
        }

        return sessions;
    }

    // Presence tracking
    async setPresence(userId: string, status: 'online' | 'offline') {
        await this.client.setex(`presence:${userId}`, 300, status);
        await this.publisher.publish('presence',
            JSON.stringify({ userId, status, timestamp: Date.now() })
        );
    }

    async getPresence(userId: string): Promise<any> {
        return this.client.get(`presence:${userId}`);
    }

    // Rate limiting
    async checkRateLimit(
        key: string,
        maxRequests: number,
        windowSeconds: number
    ): Promise<any> {
        const redisKey = `ratelimit:${key}`;
        const current = await this.client.incr(redisKey);

        if (current === 1) {
            await this.client.expire(redisKey, windowSeconds);
        }

        const allowed = current <= maxRequests;
        const remaining = Math.max(0, maxRequests - current);

        return { allowed, remaining };
    }

    // Caching
    async cache(key: string, value: any, ttl: number = 3600) {
        await this.client.setex(key, ttl, JSON.stringify(value));
    }

    async getCached(key: string): Promise<any> {
        const data = await this.client.get(key);
        return data ? JSON.parse(data) : null;
    }

    async invalidateCache(pattern: string) {
        const keys = await this.client.keys(pattern);
        if (keys.length > 0) {
            await this.client.del(...keys);
        }
    }

    // Pub/Sub
    subscribe(channel: string, callback: (message: string) => void) {
        this.subscriber.subscribe(channel);
        this.subscriber.on('message', (ch, message) => {
            if (ch === channel) {
                callback(message);
            }
        });
    }

    async publish(channel: string, message: any) {
        await this.publisher.publish(channel, JSON.stringify(message));
    }

    // Disconnect
    async disconnect() {
        await this.client.quit();
        await this.subscriber.quit();
        await this.publisher.quit();
    }
}