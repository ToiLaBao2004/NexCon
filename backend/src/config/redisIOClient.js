import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

function normalizeRedisUrl(url) {
    return (url || 'redis://127.0.0.1:6379').replace('://localhost:', '://127.0.0.1:');
}

export const REDIS_URL = normalizeRedisUrl(process.env.REDIS_URL);

const redisIOClient = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectTimeout: 10000,
    retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
    lazyConnect: false,
});

let isRedisIOReady = false;
let hasLoggedError = false;

redisIOClient.on('ready', () => {
    isRedisIOReady = true;
    hasLoggedError = false;
    console.log('[RedisIO] Đã kết nối và sẵn sàng (Dành cho BullMQ).');
});

redisIOClient.on('error', (err) => {
    isRedisIOReady = false;
    if (!hasLoggedError) {
        console.error('[RedisIO] Lỗi kết nối:', err.message);
        hasLoggedError = true;
    }
});

redisIOClient.on('end', () => {
    isRedisIOReady = false;
});

export { isRedisIOReady };
export default redisIOClient;

