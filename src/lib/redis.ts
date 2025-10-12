import { createClient, type RedisClientType } from 'redis';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

let cachedRedis: RedisClientType | null = null;

declare global {
    // eslint-disable-next-line no-var
    var __copicatRedisClient: RedisClientType | undefined;
}

/**
 * Returns a memoized Redis client so we do not open a new connection on every import.
 * Note: node-redis v4 requires an explicit connect() before use. We connect lazily on first access.
 */
export function getRedis(): RedisClientType {
    if (cachedRedis) {
        return cachedRedis;
    }

    if (!globalThis.__copicatRedisClient) {
        const client = createClient({ url: REDIS_URL });
        client.on('error', (err) => {
            console.error('[redis] connection error', err);
        });
        // Initiate connection but don't await to avoid blocking module load; callers use async ops which await internally.
        // If connection fails, operations will reject and surface the error.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        client.connect();
        globalThis.__copicatRedisClient = client;
    }

    cachedRedis = globalThis.__copicatRedisClient;
    return cachedRedis;
}
