import redisIOClient, { isRedisIOReady } from '../config/redisIOClient.js';

const PREFIX = 'nexcon:group-call';
const GROUP_CALL_TTL_SECONDS = Number(process.env.GROUP_CALL_STATE_TTL_SECONDS || 6 * 60 * 60);
const GROUP_CALL_START_RATE_LIMIT_MS = Number(process.env.GROUP_CALL_START_RATE_LIMIT_MS || 1000);

const activeSetKey = () => `${PREFIX}:active`;
const conversationKey = (conversationId) => `${PREFIX}:conversation:${conversationId}`;
const startLockKey = (userId) => `${PREFIX}:start-lock:${userId}`;
const lastStartKey = (userId) => `${PREFIX}:last-start:${userId}`;
const finalizeLockKey = (conversationId, callId) => `${PREFIX}:finalize-lock:${conversationId}:${callId}`;

let hasLoggedUnavailable = false;

function canUseRedis(action) {
    if (isRedisIOReady) {
        hasLoggedUnavailable = false;
        return true;
    }

    if (!hasLoggedUnavailable) {
        console.warn(`[GroupCallState] Redis is not ready, skipping ${action}.`);
        hasLoggedUnavailable = true;
    }
    return false;
}

function normalizeId(value) {
    return value?.toString?.() || String(value || '');
}

function mapToObject(value) {
    if (!value) return {};
    if (value instanceof Map) return Object.fromEntries(value);
    if (typeof value === 'object') return { ...value };
    return {};
}

function cleanGroupCall(groupCall) {
    if (!groupCall) return null;
    return {
        ...groupCall,
        callId: normalizeId(groupCall.callId),
        conversationId: normalizeId(groupCall.conversationId),
        initiatorId: normalizeId(groupCall.initiatorId),
        startedAt: groupCall.startedAt instanceof Date
            ? groupCall.startedAt.toISOString()
            : (groupCall.startedAt || null),
        participants: mapToObject(groupCall.participants),
        participantSockets: mapToObject(groupCall.participantSockets),
    };
}

function parseGroupCall(value) {
    if (!value) return null;
    try {
        return JSON.parse(value);
    } catch (error) {
        console.warn('[GroupCallState] Cannot parse group call JSON:', error.message);
        return null;
    }
}

async function safeRedis(action, fn, fallback) {
    if (!canUseRedis(action)) return fallback;
    try {
        return await fn();
    } catch (error) {
        console.error(`[GroupCallState] ${action} failed:`, error.message);
        return fallback;
    }
}

export async function saveGroupCall(groupCall) {
    const clean = cleanGroupCall(groupCall);
    if (!clean?.conversationId) return false;

    return safeRedis('save group call', async () => {
        await redisIOClient
            .pipeline()
            .set(conversationKey(clean.conversationId), JSON.stringify(clean), 'EX', GROUP_CALL_TTL_SECONDS)
            .sadd(activeSetKey(), clean.conversationId)
            .exec();
        return true;
    }, false);
}

export async function getGroupCall(conversationId) {
    const safeConversationId = normalizeId(conversationId);
    if (!safeConversationId) return null;

    return safeRedis('get group call', async () => {
        const groupCall = parseGroupCall(await redisIOClient.get(conversationKey(safeConversationId)));
        if (!groupCall) {
            await redisIOClient.srem(activeSetKey(), safeConversationId);
        }
        return groupCall;
    }, null);
}

export async function deleteGroupCall(conversationId) {
    const safeConversationId = normalizeId(conversationId);
    if (!safeConversationId) return false;

    return safeRedis('delete group call', async () => {
        await redisIOClient
            .pipeline()
            .del(conversationKey(safeConversationId))
            .srem(activeSetKey(), safeConversationId)
            .exec();
        return true;
    }, false);
}

export async function hasGroupCall(conversationId) {
    return Boolean(await getGroupCall(conversationId));
}

export async function listGroupCalls() {
    return safeRedis('list group calls', async () => {
        const conversationIds = await redisIOClient.smembers(activeSetKey());
        if (conversationIds.length === 0) return [];

        const results = await redisIOClient
            .pipeline(conversationIds.map((conversationId) => ['get', conversationKey(conversationId)]))
            .exec();

        const calls = [];
        const staleConversationIds = [];
        results.forEach(([error, value], index) => {
            const groupCall = error ? null : parseGroupCall(value);
            if (groupCall) calls.push(groupCall);
            else staleConversationIds.push(conversationIds[index]);
        });

        if (staleConversationIds.length > 0) {
            await redisIOClient.srem(activeSetKey(), ...staleConversationIds);
        }

        return calls;
    }, []);
}

export async function hasUserActiveGroupCall(userId) {
    const safeUserId = normalizeId(userId);
    if (!safeUserId) return false;

    const calls = await listGroupCalls();
    return calls.some((groupCall) => groupCall.participants?.[safeUserId]?.status === 'joined');
}

export async function listPendingGroupCallsForUser(userId) {
    const safeUserId = normalizeId(userId);
    if (!safeUserId) return [];

    const calls = await listGroupCalls();
    return calls.filter((groupCall) => {
        const participant = groupCall.participants?.[safeUserId];
        return participant && participant.status === 'ringing' && !participant.isLocked;
    });
}

export async function reserveGroupCallStart(userId) {
    const safeUserId = normalizeId(userId);
    if (!safeUserId) return 'server-error';

    return safeRedis('reserve group call start', async () => {
        const lockResult = await redisIOClient.set(startLockKey(safeUserId), '1', 'PX', 5000, 'NX');
        if (lockResult !== 'OK') return 'already-in-call';

        const now = Date.now();
        const lastStartedAt = Number(await redisIOClient.get(lastStartKey(safeUserId)) || 0);
        if (now - lastStartedAt < GROUP_CALL_START_RATE_LIMIT_MS) {
            await redisIOClient.del(startLockKey(safeUserId));
            return 'rate-limited';
        }

        await redisIOClient.set(lastStartKey(safeUserId), String(now), 'PX', Math.max(GROUP_CALL_START_RATE_LIMIT_MS * 2, 2000));
        return null;
    }, 'server-error');
}

export async function releaseGroupCallStart(userId) {
    const safeUserId = normalizeId(userId);
    if (!safeUserId) return false;

    return safeRedis('release group call start', async () => {
        await redisIOClient.del(startLockKey(safeUserId));
        return true;
    }, false);
}

export async function acquireGroupCallFinalizeLock(conversationId, callId) {
    const safeConversationId = normalizeId(conversationId);
    const safeCallId = normalizeId(callId);
    if (!safeConversationId || !safeCallId) return false;

    return safeRedis('acquire group call finalize lock', async () => {
        const result = await redisIOClient.set(finalizeLockKey(safeConversationId, safeCallId), '1', 'PX', 15000, 'NX');
        return result === 'OK';
    }, true);
}
