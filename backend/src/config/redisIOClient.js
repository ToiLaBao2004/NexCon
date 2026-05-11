import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();
const redisIOClient = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
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

