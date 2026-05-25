import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { REDIS_URL } from './redisIOClient.js';

function buildSocketRedisClient(label) {
    const client = new Redis(REDIS_URL, {
        lazyConnect: true,
        enableReadyCheck: true,
        connectTimeout: 10000,
        maxRetriesPerRequest: null,
        retryStrategy: (times) => Math.min(times * 100, 2000),
    });

    let hasLoggedError = false;
    client.on('error', (err) => {
        if (!hasLoggedError) {
            console.error(`[SocketRedis:${label}] Connection error:`, err.message);
            hasLoggedError = true;
        }
    });
    client.on('ready', () => {
        hasLoggedError = false;
        console.log(`[SocketRedis:${label}] Connected.`);
    });

    return client;
}

export async function configureSocketIoRedisAdapter(io) {
    const pubClient = buildSocketRedisClient('pub');
    const subClient = buildSocketRedisClient('sub');

    try {
        await Promise.all([pubClient.connect(), subClient.connect()]);
        io.adapter(createAdapter(pubClient, subClient));
        console.log('[Socket.IO] Redis adapter enabled.');
        return true;
    } catch (error) {
        console.error('[Socket.IO] Redis adapter disabled:', error.message);
        pubClient.disconnect();
        subClient.disconnect();
        return false;
    }
}
