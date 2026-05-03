import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();
const redisIOClient = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
    retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
    lazyConnect: true,
});

let hasLoggedError = false;

redisIOClient.on('connect', () => {
    hasLoggedError = false; // Reset sau khi kết nối thành công
    console.log('[RedisIO] Đã kết nối thành công (Dành cho BullMQ).');
});

redisIOClient.on('error', (err) => {
    if (!hasLoggedError) {
        console.error('[RedisIO] Lỗi kết nối:', err.message);
        hasLoggedError = true;
    }
});

export default redisIOClient;

