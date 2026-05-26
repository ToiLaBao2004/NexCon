import redisIOClient, { isRedisIOReady } from '../config/redisIOClient.js';

const PRESENCE_PREFIX = 'nexcon:presence';
const SOCKET_TTL_SECONDS = Number(process.env.SOCKET_PRESENCE_TTL_SECONDS || 120);
const INSTANCE_ID = process.env.RAILWAY_REPLICA_ID
    || process.env.RAILWAY_DEPLOYMENT_ID
    || process.env.HOSTNAME
    || `local-${process.pid}`;

const onlineUsersKey = () => `${PRESENCE_PREFIX}:users`;
const socketKey = (socketId) => `${PRESENCE_PREFIX}:socket:${socketId}`;
const userSocketsKey = (userId) => `${PRESENCE_PREFIX}:user:${userId}:sockets`;

let hasLoggedUnavailable = false;

function canUseRedis(action) {
    if (isRedisIOReady) {
        hasLoggedUnavailable = false;
        return true;
    }

    if (!hasLoggedUnavailable) {
        console.warn(`[Presence] Redis is not ready, skipping ${action}.`);
        hasLoggedUnavailable = true;
    }
    return false;
}

function normalizeId(value) {
    return value?.toString?.() || String(value || '');
}

function uniqueIds(values = []) {
    return [...new Set(values.map(normalizeId).filter(Boolean))];
}

async function safeRedis(action, fn, fallback) {
    if (!canUseRedis(action)) return fallback;

    try {
        return await fn();
    } catch (error) {
        console.error(`[Presence] ${action} failed:`, error.message);
        return fallback;
    }
}

export async function registerSocketPresence({ socketId, userId, sessionId }) {
    const safeSocketId = normalizeId(socketId);
    const safeUserId = normalizeId(userId);
    if (!safeSocketId || !safeUserId) return false;

    return safeRedis('register socket', async () => {
        const pipeline = redisIOClient.pipeline();
        pipeline.hset(socketKey(safeSocketId), {
            userId: safeUserId,
            sessionId: normalizeId(sessionId),
            instanceId: INSTANCE_ID,
            connectedAt: new Date().toISOString(),
        });
        pipeline.expire(socketKey(safeSocketId), SOCKET_TTL_SECONDS);
        pipeline.sadd(userSocketsKey(safeUserId), safeSocketId);
        pipeline.expire(userSocketsKey(safeUserId), SOCKET_TTL_SECONDS + 30);
        pipeline.sadd(onlineUsersKey(), safeUserId);
        await pipeline.exec();
        return true;
    }, false);
}

export async function refreshSocketPresence(socketId, userId) {
    const safeSocketId = normalizeId(socketId);
    const safeUserId = normalizeId(userId);
    if (!safeSocketId || !safeUserId) return false;

    return safeRedis('refresh socket', async () => {
        const pipeline = redisIOClient.pipeline();
        pipeline.expire(socketKey(safeSocketId), SOCKET_TTL_SECONDS);
        pipeline.expire(userSocketsKey(safeUserId), SOCKET_TTL_SECONDS + 30);
        await pipeline.exec();
        return true;
    }, false);
}

async function pruneUserSockets(userId) {
    const safeUserId = normalizeId(userId);
    if (!safeUserId) return [];

    const socketIds = await redisIOClient.smembers(userSocketsKey(safeUserId));
    if (socketIds.length === 0) {
        await redisIOClient.srem(onlineUsersKey(), safeUserId);
        return [];
    }

    const existsResults = await redisIOClient
        .pipeline(socketIds.map((id) => ['exists', socketKey(id)]))
        .exec();

    const liveSocketIds = [];
    const staleSocketIds = [];
    existsResults.forEach(([error, exists], index) => {
        if (!error && exists === 1) {
            liveSocketIds.push(socketIds[index]);
        } else {
            staleSocketIds.push(socketIds[index]);
        }
    });

    if (staleSocketIds.length > 0) {
        await redisIOClient.srem(userSocketsKey(safeUserId), ...staleSocketIds);
    }

    if (liveSocketIds.length === 0) {
        await redisIOClient.del(userSocketsKey(safeUserId));
        await redisIOClient.srem(onlineUsersKey(), safeUserId);
    }

    return liveSocketIds;
}

export async function removeSocketPresence(socketId, userId) {
    const safeSocketId = normalizeId(socketId);
    const safeUserId = normalizeId(userId);
    if (!safeSocketId || !safeUserId) return false;

    return safeRedis('remove socket', async () => {
        await redisIOClient
            .pipeline()
            .del(socketKey(safeSocketId))
            .srem(userSocketsKey(safeUserId), safeSocketId)
            .exec();
        await pruneUserSockets(safeUserId);
        return true;
    }, false);
}

export async function isUserOnlineInRedis(userId) {
    const safeUserId = normalizeId(userId);
    if (!safeUserId) return false;

    return safeRedis('check online user', async () => {
        const socketIds = await pruneUserSockets(safeUserId);
        return socketIds.length > 0;
    }, false);
}

export async function getOnlineUserIdsFromRedis() {
    return safeRedis('list online users', async () => {
        const userIds = await redisIOClient.smembers(onlineUsersKey());
        return getOnlineUserIdsForUsersFromRedis(userIds);
    }, []);
}

export async function getOnlineUserIdsForUsersFromRedis(userIds = []) {
    const safeUserIds = uniqueIds(userIds);
    if (safeUserIds.length === 0) return [];

    return safeRedis('list selected online users', async () => {
        const socketSetResults = await redisIOClient
            .pipeline(safeUserIds.map((id) => ['smembers', userSocketsKey(id)]))
            .exec();

        const socketIdsByUserId = new Map();
        const socketToUserId = new Map();
        const allSocketIds = [];

        socketSetResults.forEach(([error, socketIds], index) => {
            if (error || !Array.isArray(socketIds) || socketIds.length === 0) {
                socketIdsByUserId.set(safeUserIds[index], []);
                return;
            }

            const uniqueSocketIds = uniqueIds(socketIds);
            socketIdsByUserId.set(safeUserIds[index], uniqueSocketIds);
            uniqueSocketIds.forEach((socketId) => {
                socketToUserId.set(socketId, safeUserIds[index]);
                allSocketIds.push(socketId);
            });
        });

        if (allSocketIds.length === 0) {
            await redisIOClient.srem(onlineUsersKey(), ...safeUserIds);
            return [];
        }

        const existsResults = await redisIOClient
            .pipeline(allSocketIds.map((id) => ['exists', socketKey(id)]))
            .exec();

        const liveSocketIdsByUserId = new Map();
        const staleSocketIdsByUserId = new Map();

        existsResults.forEach(([error, exists], index) => {
            const socketId = allSocketIds[index];
            const userId = socketToUserId.get(socketId);
            if (!userId) return;

            const targetMap = !error && exists === 1
                ? liveSocketIdsByUserId
                : staleSocketIdsByUserId;
            if (!targetMap.has(userId)) targetMap.set(userId, []);
            targetMap.get(userId).push(socketId);
        });

        const cleanupPipeline = redisIOClient.pipeline();
        const onlineUserIds = [];
        let hasCleanup = false;

        safeUserIds.forEach((userId) => {
            const liveSocketIds = liveSocketIdsByUserId.get(userId) || [];
            const staleSocketIds = staleSocketIdsByUserId.get(userId) || [];

            if (staleSocketIds.length > 0) {
                cleanupPipeline.srem(userSocketsKey(userId), ...staleSocketIds);
                hasCleanup = true;
            }

            if (liveSocketIds.length > 0) {
                onlineUserIds.push(userId);
                return;
            }

            cleanupPipeline.del(userSocketsKey(userId));
            cleanupPipeline.srem(onlineUsersKey(), userId);
            hasCleanup = true;
        });

        if (hasCleanup) {
            await cleanupPipeline.exec();
        }

        return onlineUserIds;
    }, []);
}
