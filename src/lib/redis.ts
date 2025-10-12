import { Redis } from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

let cachedRedis: Redis | null = null;

declare global {
    // eslint-disable-next-line no-var
    var __copicatRedisClient: Redis | undefined;
}

/**
 * Returns a memoized Redis client so we do not open a new connection on every import.
 */
export function getRedis(): Redis {
    if (cachedRedis) {
        return cachedRedis;
    }

    if (!globalThis.__copicatRedisClient) {
        globalThis.__copicatRedisClient = new Redis(REDIS_URL);
        globalThis.__copicatRedisClient.on('error', (err) => {
            console.error('[redis] connection error', err);
        });
    }

    cachedRedis = globalThis.__copicatRedisClient;
    return cachedRedis;
}
