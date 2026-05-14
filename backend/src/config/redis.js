import { createClient } from 'redis';

function normalizeRedisUrl(url) {
    return (url || 'redis://127.0.0.1:6379').replace('://localhost:', '://127.0.0.1:');
}

const REDIS_URL = normalizeRedisUrl(process.env.REDIS_URL);

const redis = createClient({ url: REDIS_URL });

let isRedisReady = false;
let hasLoggedError = false;

redis.on('error', (err) => {
    if (!hasLoggedError) {
        console.error('[Redis] Lỗi kết nối:', err.message);
        hasLoggedError = true;
    }
});

redis.on('ready', () => {
    isRedisReady = true;
    hasLoggedError = false; // Reset sau khi kết nối thành công
    console.log('[Redis] Đã kết nối thành công.');
});

redis.on('end', () => {
    isRedisReady = false;
});

// Kết nối không chặn server khởi động
async function connectRedis() {
    try {
        await redis.connect();
    } catch (err) {
        console.error('[Redis] Không thể kết nối lúc khởi động:', err.message);
        console.warn('[Redis] Server vẫn chạy. Các tính năng dùng Redis sẽ tạm thời không hoạt động.');
        scheduleReconnect();
    }
}

function scheduleReconnect() {
    setTimeout(async () => {
        if (!isRedisReady) {
            try {
                await redis.connect();
            } catch (err) {
                // Không log lỗi ở đây vì event error đã xử lý việc log 1 lần
                scheduleReconnect();
            }
        }
    }, 5000);
}

// Gọi connect nhưng KHÔNG await ở top-level , không block import
connectRedis();

export { isRedisReady };
export default redis;
