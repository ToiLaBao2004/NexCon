import redisIOClient, { isRedisIOReady } from '../config/redisIOClient.js';

const PREFIX = 'nexcon:direct-call';
const SESSION_TTL_SECONDS = Number(process.env.DIRECT_CALL_STATE_TTL_SECONDS || 2 * 60 * 60);
const OFFER_RATE_LIMIT_MS = Number(process.env.DIRECT_CALL_OFFER_RATE_LIMIT_MS || 1000);

const activeSetKey = () => `${PREFIX}:active`;
const sessionKey = (sessionId) => `${PREFIX}:session:${sessionId}`;
const pairKey = (callKey) => `${PREFIX}:pair:${callKey}`;
const roomKey = (roomName) => `${PREFIX}:room:${roomName}`;
const userSessionsKey = (userId) => `${PREFIX}:user:${userId}:sessions`;
const offerLockKey = (userId) => `${PREFIX}:offer-lock:${userId}`;
const lastOfferKey = (userId) => `${PREFIX}:last-offer:${userId}`;
const finalizeLockKey = (sessionId) => `${PREFIX}:finalize-lock:${sessionId}`;

let hasLoggedUnavailable = false;

function canUseRedis(action) {
    if (isRedisIOReady) {
        hasLoggedUnavailable = false;
        return true;
    }

    if (!hasLoggedUnavailable) {
        console.warn(`[DirectCallState] Redis is not ready, skipping ${action}.`);
        hasLoggedUnavailable = true;
    }
    return false;
}

function normalizeId(value) {
    return value?.toString?.() || String(value || '');
}

function cleanSession(session) {
    if (!session) return null;
    const { ringTimeout, ...cleaned } = session;
    return {
        ...cleaned,
        sessionId: normalizeId(cleaned.sessionId),
        callerId: normalizeId(cleaned.callerId),
        receiverId: normalizeId(cleaned.receiverId),
        conversationId: normalizeId(cleaned.conversationId),
        callKey: normalizeId(cleaned.callKey),
        roomName: normalizeId(cleaned.roomName),
    };
}

function parseSession(value) {
    if (!value) return null;
    try {
        return JSON.parse(value);
    } catch (error) {
        console.warn('[DirectCallState] Cannot parse session JSON:', error.message);
        return null;
    }
}

async function safeRedis(action, fn, fallback) {
    if (!canUseRedis(action)) return fallback;
    try {
        return await fn();
    } catch (error) {
        console.error(`[DirectCallState] ${action} failed:`, error.message);
        return fallback;
    }
}

async function getSessionByIdUnsafe(sessionId) {
    return parseSession(await redisIOClient.get(sessionKey(sessionId)));
}

async function pruneUserSessionIds(userId) {
    const key = userSessionsKey(userId);
    const sessionIds = await redisIOClient.smembers(key);
    if (sessionIds.length === 0) return [];

    const existsResults = await redisIOClient
        .pipeline(sessionIds.map((sessionId) => ['exists', sessionKey(sessionId)]))
        .exec();

    const liveIds = [];
    const staleIds = [];
    existsResults.forEach(([error, exists], index) => {
        if (!error && exists === 1) liveIds.push(sessionIds[index]);
        else staleIds.push(sessionIds[index]);
    });

    if (staleIds.length > 0) await redisIOClient.srem(key, ...staleIds);
    if (liveIds.length === 0) await redisIOClient.del(key);

    return liveIds;
}

export function getDirectCallKey(userId1, userId2) {
    const a = normalizeId(userId1);
    const b = normalizeId(userId2);
    return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export async function saveDirectCallSession(session) {
    const clean = cleanSession(session);
    if (!clean?.sessionId) return false;

    return safeRedis('save session', async () => {
        const payload = JSON.stringify(clean);
        const pipeline = redisIOClient.pipeline();
        pipeline.set(sessionKey(clean.sessionId), payload, 'EX', SESSION_TTL_SECONDS);
        pipeline.sadd(activeSetKey(), clean.sessionId);
        if (clean.callKey) pipeline.set(pairKey(clean.callKey), clean.sessionId, 'EX', SESSION_TTL_SECONDS);
        if (clean.roomName) pipeline.set(roomKey(clean.roomName), clean.sessionId, 'EX', SESSION_TTL_SECONDS);
        if (clean.callerId) {
            pipeline.sadd(userSessionsKey(clean.callerId), clean.sessionId);
            pipeline.expire(userSessionsKey(clean.callerId), SESSION_TTL_SECONDS);
        }
        if (clean.receiverId) {
            pipeline.sadd(userSessionsKey(clean.receiverId), clean.sessionId);
            pipeline.expire(userSessionsKey(clean.receiverId), SESSION_TTL_SECONDS);
        }
        await pipeline.exec();
        return true;
    }, false);
}

export async function getDirectCallBySessionId(sessionId) {
    const safeSessionId = normalizeId(sessionId);
    if (!safeSessionId) return null;

    return safeRedis('get session by id', () => getSessionByIdUnsafe(safeSessionId), null);
}

export async function getDirectCallByRoom(roomName) {
    const safeRoomName = normalizeId(roomName);
    if (!safeRoomName) return null;

    return safeRedis('get session by room', async () => {
        const sessionId = await redisIOClient.get(roomKey(safeRoomName));
        return sessionId ? getSessionByIdUnsafe(sessionId) : null;
    }, null);
}

export async function findDirectCallBetween(userId1, userId2) {
    const callKey = getDirectCallKey(userId1, userId2);

    return safeRedis('find session by pair', async () => {
        const sessionId = await redisIOClient.get(pairKey(callKey));
        return sessionId ? getSessionByIdUnsafe(sessionId) : null;
    }, null);
}

export async function listDirectCallsForUser(userId) {
    const safeUserId = normalizeId(userId);
    if (!safeUserId) return [];

    return safeRedis('list user sessions', async () => {
        const sessionIds = await pruneUserSessionIds(safeUserId);
        if (sessionIds.length === 0) return [];

        const results = await redisIOClient
            .pipeline(sessionIds.map((sessionId) => ['get', sessionKey(sessionId)]))
            .exec();

        return results
            .map(([error, value]) => (error ? null : parseSession(value)))
            .filter(Boolean);
    }, []);
}

export async function findDirectCallForParticipants({ userId, otherUserId = null, roomName = null }) {
    const safeUserId = normalizeId(userId);
    const safeOtherUserId = normalizeId(otherUserId);
    const safeRoomName = normalizeId(roomName);

    if (safeRoomName) {
        const byRoom = await getDirectCallByRoom(safeRoomName);
        if (!byRoom) return null;
        if (safeUserId && ![byRoom.callerId, byRoom.receiverId].includes(safeUserId)) return null;
        if (safeOtherUserId && ![byRoom.callerId, byRoom.receiverId].includes(safeOtherUserId)) return null;
        return byRoom;
    }

    if (safeUserId && safeOtherUserId) {
        return findDirectCallBetween(safeUserId, safeOtherUserId);
    }

    if (safeUserId) {
        const sessions = await listDirectCallsForUser(safeUserId);
        return sessions.find((session) => [session.callerId, session.receiverId].includes(safeUserId)) || null;
    }

    return null;
}

export async function findStoredDirectCall(session) {
    if (!session) return null;
    if (session.sessionId) {
        const byId = await getDirectCallBySessionId(session.sessionId);
        if (byId) return byId;
    }
    if (session.callKey) {
        const ids = session.callKey.split(':');
        if (ids.length === 2) return findDirectCallBetween(ids[0], ids[1]);
    }
    if (session.roomName) return getDirectCallByRoom(session.roomName);
    return null;
}

export async function deleteDirectCallSession(session) {
    const clean = cleanSession(session);
    if (!clean?.sessionId) return false;

    return safeRedis('delete session', async () => {
        const pipeline = redisIOClient.pipeline();
        pipeline.del(sessionKey(clean.sessionId));
        pipeline.srem(activeSetKey(), clean.sessionId);
        if (clean.callKey) pipeline.del(pairKey(clean.callKey));
        if (clean.roomName) pipeline.del(roomKey(clean.roomName));
        if (clean.callerId) pipeline.srem(userSessionsKey(clean.callerId), clean.sessionId);
        if (clean.receiverId) pipeline.srem(userSessionsKey(clean.receiverId), clean.sessionId);
        await pipeline.exec();
        return true;
    }, false);
}

export async function hasUserDirectCall(userId) {
    const sessions = await listDirectCallsForUser(userId);
    return sessions.some((session) => ['calling', 'connecting', 'in-call'].includes(session.status));
}

export async function reserveDirectCallOffer(userId) {
    const safeUserId = normalizeId(userId);
    if (!safeUserId) return 'server-error';

    return safeRedis('reserve offer', async () => {
        const lockResult = await redisIOClient.set(offerLockKey(safeUserId), '1', 'PX', 5000, 'NX');
        if (lockResult !== 'OK') return 'already-in-call';

        const now = Date.now();
        const lastOfferAt = Number(await redisIOClient.get(lastOfferKey(safeUserId)) || 0);
        if (now - lastOfferAt < OFFER_RATE_LIMIT_MS) {
            await redisIOClient.del(offerLockKey(safeUserId));
            return 'rate-limited';
        }

        await redisIOClient.set(lastOfferKey(safeUserId), String(now), 'PX', Math.max(OFFER_RATE_LIMIT_MS * 2, 2000));
        return null;
    }, 'server-error');
}

export async function releaseDirectCallOffer(userId) {
    const safeUserId = normalizeId(userId);
    if (!safeUserId) return false;

    return safeRedis('release offer', async () => {
        await redisIOClient.del(offerLockKey(safeUserId));
        return true;
    }, false);
}

export async function acquireDirectCallFinalizeLock(sessionId) {
    const safeSessionId = normalizeId(sessionId);
    if (!safeSessionId) return false;

    return safeRedis('acquire finalize lock', async () => {
        const result = await redisIOClient.set(finalizeLockKey(safeSessionId), '1', 'PX', 15000, 'NX');
        return result === 'OK';
    }, true);
}
