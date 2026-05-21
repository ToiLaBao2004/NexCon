import mongoose from 'mongoose';
import redis, { isRedisReady } from '../../config/redis.js';
import User from '../../models/userModel.js';
import Session from '../../models/sessionModel.js';
import LockAppeal from '../../models/lockAppealModel.js';
import { createNotification } from '../notificationServices.js';
import { disconnectUserSockets } from '../../socket/index.js';

const VIOLATION_DECAY_MS = 7 * 24 * 60 * 60 * 1000;
const VIOLATION_DECAY_SECONDS = Math.floor(VIOLATION_DECAY_MS / 1000);
const LOCK_THRESHOLD = Number.parseInt(process.env.VIOLATION_LOCK_THRESHOLD || '5', 10);
const MAX_VIOLATION_HISTORY = Number.parseInt(process.env.VIOLATION_HISTORY_LIMIT || '50', 10) || 50;

const READ_REDIS_VIOLATION_STATE_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local decayMs = tonumber(ARGV[2])
local keyType = redis.call('TYPE', key).ok
local count = 0
local lastViolationAt = 0
local nextDecayAt = 0

if keyType == 'zset' then
    count = tonumber(redis.call('ZCARD', key)) or 0
    if count > 0 then
        local latest = redis.call('ZRANGE', key, -1, -1, 'WITHSCORES')
        lastViolationAt = tonumber(latest[2]) or now
        nextDecayAt = lastViolationAt + decayMs
    end
    redis.call('DEL', key)
elseif keyType == 'hash' then
    count = tonumber(redis.call('HGET', key, 'count')) or 0
    lastViolationAt = tonumber(redis.call('HGET', key, 'lastViolationAt')) or 0
    nextDecayAt = tonumber(redis.call('HGET', key, 'nextDecayAt')) or 0
elseif keyType ~= 'none' then
    redis.call('DEL', key)
end

if count <= 0 then
    redis.call('DEL', key)
    return { 0, lastViolationAt, 0 }
end

if nextDecayAt <= 0 then
    if lastViolationAt > 0 then
        nextDecayAt = lastViolationAt + decayMs
    else
        nextDecayAt = now + decayMs
    end
end

if nextDecayAt <= now then
    local periods = math.floor((now - nextDecayAt) / decayMs) + 1
    count = count - periods
    if count <= 0 then
        redis.call('DEL', key)
        return { 0, lastViolationAt, 0 }
    end
    nextDecayAt = nextDecayAt + (periods * decayMs)
end

redis.call('HSET', key, 'count', count, 'lastViolationAt', lastViolationAt, 'nextDecayAt', nextDecayAt)
local ttl = math.ceil((nextDecayAt + ((count - 1) * decayMs) - now) / 1000)
if ttl < 1 then ttl = 1 end
redis.call('EXPIRE', key, ttl)

return { count, lastViolationAt, nextDecayAt }
`;

const REGISTER_REDIS_VIOLATION_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local decayMs = tonumber(ARGV[2])
local decaySeconds = tonumber(ARGV[3])
local keyType = redis.call('TYPE', key).ok
local count = 0
local lastViolationAt = 0
local nextDecayAt = 0

if keyType == 'zset' then
    count = tonumber(redis.call('ZCARD', key)) or 0
    if count > 0 then
        local latest = redis.call('ZRANGE', key, -1, -1, 'WITHSCORES')
        lastViolationAt = tonumber(latest[2]) or now
        nextDecayAt = lastViolationAt + decayMs
    end
    redis.call('DEL', key)
elseif keyType == 'hash' then
    count = tonumber(redis.call('HGET', key, 'count')) or 0
    lastViolationAt = tonumber(redis.call('HGET', key, 'lastViolationAt')) or 0
    nextDecayAt = tonumber(redis.call('HGET', key, 'nextDecayAt')) or 0
elseif keyType ~= 'none' then
    redis.call('DEL', key)
end

if count > 0 then
    if nextDecayAt <= 0 then
        if lastViolationAt > 0 then
            nextDecayAt = lastViolationAt + decayMs
        else
            nextDecayAt = now + decayMs
        end
    end

    if nextDecayAt <= now then
        local periods = math.floor((now - nextDecayAt) / decayMs) + 1
        count = count - periods
        if count < 0 then count = 0 end
    end
end

count = count + 1
lastViolationAt = now
nextDecayAt = now + decayMs

redis.call('HSET', key, 'count', count, 'lastViolationAt', lastViolationAt, 'nextDecayAt', nextDecayAt)
redis.call('EXPIRE', key, count * decaySeconds)

return { count, lastViolationAt, nextDecayAt }
`;

function violationKey(userId) {
    return `moderation:violations:${userId.toString()}`;
}

function normalizeReason(reason) {
    return String(reason || 'Vi phạm tiêu chuẩn cộng đồng.').trim().slice(0, 1000);
}

function normalizeOptionalDate(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
}

function objectIdOrNull(value) {
    const raw = value?._id || value;
    if (!raw) return null;
    const text = raw.toString?.() || String(raw);
    return mongoose.Types.ObjectId.isValid(text) ? new mongoose.Types.ObjectId(text) : null;
}

function numberOrNull(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function sanitizeMetadata(value, depth = 0) {
    if (value == null) return value;
    if (depth > 4) return '[Max depth]';
    if (typeof value === 'string') return value.slice(0, 1000);
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeMetadata(item, depth + 1));
    if (typeof value === 'object') {
        return Object.entries(value).reduce((acc, [key, item]) => {
            acc[String(key).slice(0, 80)] = sanitizeMetadata(item, depth + 1);
            return acc;
        }, {});
    }
    return String(value).slice(0, 1000);
}

function buildViolationHistoryEntry({
    actorId = null,
    source = 'manual',
    reason = '',
    metadata = {},
    count = 0,
    willLock = false,
}) {
    const aiModeration = metadata?.aiModeration || {};
    const category = metadata?.category || aiModeration?.category || '';
    const confidence = metadata?.confidence ?? aiModeration?.confidence ?? null;
    const messageId = metadata?.messageId || metadata?.targetMessageId || null;

    return {
        _id: new mongoose.Types.ObjectId(),
        recordedAt: new Date(),
        source: String(source || 'manual').slice(0, 120),
        reason: normalizeReason(reason),
        category: String(category || '').slice(0, 80),
        confidence: numberOrNull(confidence),
        status: willLock ? 'account_locked' : 'warning_sent',
        action: willLock ? 'account_locked' : 'message_blocked',
        countAfter: count,
        threshold: LOCK_THRESHOLD,
        messageType: String(metadata?.messageType || '').slice(0, 40),
        conversationId: objectIdOrNull(metadata?.conversationId),
        messageId: objectIdOrNull(messageId),
        reportId: objectIdOrNull(metadata?.reportId),
        actorId: objectIdOrNull(actorId),
        metadata: sanitizeMetadata(metadata),
    };
}

function serializeViolationHistoryItem(item = {}) {
    return {
        _id: item._id?.toString?.() || item._id || null,
        recordedAt: item.recordedAt || null,
        source: item.source || 'unknown',
        reason: item.reason || '',
        category: item.category || '',
        confidence: item.confidence ?? null,
        status: item.status || 'recorded',
        action: item.action || '',
        countAfter: item.countAfter || 0,
        threshold: item.threshold || LOCK_THRESHOLD,
        messageType: item.messageType || '',
        conversationId: item.conversationId?.toString?.() || item.conversationId || null,
        messageId: item.messageId?.toString?.() || item.messageId || null,
        reportId: item.reportId?.toString?.() || item.reportId || null,
        actorId: item.actorId?.toString?.() || item.actorId || null,
        metadata: item.metadata || null,
    };
}

export function buildRestrictionDetails(user) {
    const lock = user?.lock || {};
    const locked = Boolean(lock.isLocked);
    const blockedUntil = lock.expiresAt || null;
    const reason = locked
        ? normalizeReason(lock.reason || 'Tài khoản của bạn đang bị khóa do vi phạm tiêu chuẩn cộng đồng.')
        : '';

    return {
        locked,
        type: locked ? 'account_lock' : 'none',
        reason,
        lockedAt: lock.lockedAt || null,
        blockedUntil,
        isTemporary: Boolean(blockedUntil),
        canAppeal: locked,
        detailsUrl: '/moderation',
        appealUrl: '/signin',
        message: locked
            ? blockedUntil
                ? `Tài khoản bị khóa tạm thời đến ${new Date(blockedUntil).toLocaleString('vi-VN')}.`
                : 'Tài khoản bị khóa cho đến khi admin mở khóa hoặc chấp nhận khiếu nại.'
            : '',
    };
}

function buildLockNotice() {
    return 'Tài khoản của bạn đã bị khóa sau khi chúng tôi xem xét vi phạm. Nếu cho rằng quyết định này nhầm lẫn, bạn có thể gửi kháng cáo từ màn hình đăng nhập.';
}

function toMs(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    const ms = date.getTime();
    return Number.isFinite(ms) ? ms : null;
}

function stateFromRedisResult(result) {
    const count = Math.max(0, Number.parseInt(result?.[0] || 0, 10) || 0);
    const lastViolationAtMs = Number(result?.[1]) || 0;
    const nextDecayAtMs = Number(result?.[2]) || 0;

    return {
        count,
        lastViolationAt: lastViolationAtMs > 0 ? new Date(lastViolationAtMs) : null,
        nextDecayAt: nextDecayAtMs > 0 ? new Date(nextDecayAtMs) : null,
    };
}

function applyViolationDecay(state, now = Date.now()) {
    const originalCount = Math.max(0, Number.parseInt(state?.count || 0, 10) || 0);
    const lastViolationAtMs = toMs(state?.lastViolationAt);
    const originalNextDecayAtMs = toMs(state?.nextDecayAt);
    let count = originalCount;
    let nextDecayAtMs = originalNextDecayAtMs;
    let changed = false;

    if (count <= 0) {
        return {
            count: 0,
            lastViolationAt: lastViolationAtMs ? new Date(lastViolationAtMs) : null,
            nextDecayAt: null,
            changed: originalCount !== 0 || Boolean(originalNextDecayAtMs),
        };
    }

    if (!nextDecayAtMs) {
        nextDecayAtMs = lastViolationAtMs ? lastViolationAtMs + VIOLATION_DECAY_MS : now + VIOLATION_DECAY_MS;
        changed = true;
    }

    if (nextDecayAtMs <= now) {
        const periods = Math.floor((now - nextDecayAtMs) / VIOLATION_DECAY_MS) + 1;
        count = Math.max(0, count - periods);
        nextDecayAtMs = count > 0 ? nextDecayAtMs + (periods * VIOLATION_DECAY_MS) : null;
        changed = true;
    }

    return {
        count,
        lastViolationAt: lastViolationAtMs ? new Date(lastViolationAtMs) : null,
        nextDecayAt: nextDecayAtMs ? new Date(nextDecayAtMs) : null,
        changed: changed || count !== originalCount || nextDecayAtMs !== originalNextDecayAtMs,
    };
}

async function readRedisViolationState(userId) {
    const result = await redis.eval(READ_REDIS_VIOLATION_STATE_SCRIPT, {
        keys: [violationKey(userId)],
        arguments: [String(Date.now()), String(VIOLATION_DECAY_MS)],
    });

    return stateFromRedisResult(result);
}

async function registerRedisViolation(userId) {
    const result = await redis.eval(REGISTER_REDIS_VIOLATION_SCRIPT, {
        keys: [violationKey(userId)],
        arguments: [String(Date.now()), String(VIOLATION_DECAY_MS), String(VIOLATION_DECAY_SECONDS)],
    });

    return stateFromRedisResult(result);
}

async function readMongoViolationState(userId) {
    const user = await User.findById(userId).select('moderation').lean();
    const state = applyViolationDecay({
        count: user?.moderation?.violationCountCache || 0,
        lastViolationAt: user?.moderation?.lastViolationAt || null,
        nextDecayAt: user?.moderation?.nextViolationDecayAt || null,
    });

    if (user && state.changed) {
        await User.findByIdAndUpdate(userId, {
            $set: {
                'moderation.violationCountCache': state.count,
                'moderation.nextViolationDecayAt': state.nextDecayAt,
            },
        });
    }

    return state;
}

export async function getViolationSummary(userId) {
    if (isRedisReady) {
        const state = await readRedisViolationState(userId);

        return {
            count: state.count,
            threshold: LOCK_THRESHOLD,
            decayDays: 7,
            lastViolationAt: state.lastViolationAt,
            nextDecayAt: state.nextDecayAt,
            source: 'redis',
        };
    }

    const state = await readMongoViolationState(userId);
    return {
        count: state.count,
        threshold: LOCK_THRESHOLD,
        decayDays: 7,
        lastViolationAt: state.lastViolationAt,
        nextDecayAt: state.nextDecayAt,
        source: 'mongo-cache',
    };
}

export async function getUserModerationDetails(userId, { limit = 20 } = {}) {
    const user = await User.findById(userId).select('lock moderation').lean();
    if (!user) {
        const error = new Error('User not found.');
        error.statusCode = 404;
        throw error;
    }

    const [summary, pendingAppeal] = await Promise.all([
        getViolationSummary(userId),
        LockAppeal.findOne({ userId, status: 'pending' })
            .select('_id status reason createdAt updatedAt')
            .sort({ createdAt: -1 })
            .lean(),
    ]);

    const historyLimit = Math.max(1, Math.min(100, Number.parseInt(limit, 10) || 20));
    const history = [...(user.moderation?.violationHistory || [])]
        .slice(-historyLimit)
        .reverse()
        .map(serializeViolationHistoryItem);

    return {
        summary: {
            ...summary,
            lastViolationAt: user.moderation?.lastViolationAt || summary.lastViolationAt || null,
        },
        restriction: buildRestrictionDetails(user),
        history,
        appeal: pendingAppeal
            ? {
                _id: pendingAppeal._id,
                status: pendingAppeal.status,
                reason: pendingAppeal.reason,
                submittedAt: pendingAppeal.createdAt,
                updatedAt: pendingAppeal.updatedAt,
                canSubmit: false,
            }
            : {
                status: null,
                canSubmit: Boolean(user.lock?.isLocked),
            },
    };
}

export async function lockAccount({ userId, adminId = null, reason = '', expiresAt = null }) {
    const lockReason = normalizeReason(reason || 'Tài khoản bị khóa do vượt ngưỡng vi phạm.');
    const lockExpiresAt = normalizeOptionalDate(expiresAt);
    const current = await User.findById(userId).select('lock').lean();
    const wasLocked = Boolean(current?.lock?.isLocked);
    const user = await User.findByIdAndUpdate(
        userId,
        {
            $set: {
                'lock.isLocked': true,
                'lock.lockedAt': new Date(),
                'lock.expiresAt': lockExpiresAt,
                'lock.lockedBy': adminId,
                'lock.reason': lockReason,
                'lock.unlockedAt': null,
                'lock.unlockedBy': null,
            },
        },
        { new: true }
    ).select('_id email displayName lock role');

    if (!user) {
        const error = new Error('User not found.');
        error.statusCode = 404;
        throw error;
    }

    if (!wasLocked) {
        await Session.deleteMany({ userId: user._id });
        disconnectUserSockets(user._id, 'account-locked');
    }

    if (!wasLocked) {
        await createNotification(
            user._id,
            'Tài khoản đã bị khóa',
            buildLockNotice(),
            `${process.env.FRONTEND_URL}/signin`,
            {
                type: 'account-lock',
                metadata: { reason: lockReason },
            }
        );
    }

    return user;
}

export async function unlockAccount({ userId, adminId = null, reason = '', resetViolations = true }) {
    if (resetViolations && isRedisReady) {
        await redis.del(violationKey(userId));
    }

    const update = {
        $set: {
            'lock.isLocked': false,
            'lock.unlockedAt': new Date(),
            'lock.unlockedBy': adminId,
            'lock.reason': null,
            'lock.expiresAt': null,
            'moderation.violationCountCache': resetViolations ? 0 : undefined,
        },
    };

    if (resetViolations) {
        update.$set['moderation.lastViolationAt'] = null;
        update.$set['moderation.nextViolationDecayAt'] = null;
    }

    Object.keys(update.$set).forEach((key) => {
        if (update.$set[key] === undefined) delete update.$set[key];
    });

    const user = await User.findByIdAndUpdate(userId, update, { new: true })
        .select('_id email displayName lock role moderation');

    if (!user) {
        const error = new Error('User not found.');
        error.statusCode = 404;
        throw error;
    }

    await createNotification(
        user._id,
        'Tài khoản đã được mở khóa',
        'Tài khoản của bạn đã được mở khóa. Bạn có thể tiếp tục sử dụng NexCon.',
        `${process.env.FRONTEND_URL}/notification`,
        {
            type: 'account-unlock',
            metadata: { resetViolations },
        }
    );

    return user;
}

export async function registerViolation({
    userId,
    actorId = null,
    source = 'manual',
    reason = '',
    metadata = {},
    notify = true,
}) {
    const normalizedReason = normalizeReason(reason);
    let count;
    let violationState;
    let latestViolation = null;

    if (isRedisReady) {
        violationState = await registerRedisViolation(userId);
    } else {
        const currentState = await readMongoViolationState(userId);
        const now = new Date();
        violationState = {
            count: currentState.count + 1,
            lastViolationAt: now,
            nextDecayAt: new Date(now.getTime() + VIOLATION_DECAY_MS),
        };
    }

    count = violationState.count;

    const user = await User.findByIdAndUpdate(
        userId,
        {
            $set: {
                'moderation.violationCountCache': count,
                'moderation.lastViolationAt': violationState.lastViolationAt,
                'moderation.nextViolationDecayAt': violationState.nextDecayAt,
            },
        },
        { new: true }
    ).select('_id displayName email lock moderation role');

    if (!user) {
        const error = new Error('User not found.');
        error.statusCode = 404;
        throw error;
    }

    const willLock = count >= LOCK_THRESHOLD && !user.lock?.isLocked;
    latestViolation = buildViolationHistoryEntry({
        actorId,
        source,
        reason: normalizedReason,
        metadata,
        count,
        willLock,
    });

    await User.updateOne(
        { _id: user._id },
        {
            $push: {
                'moderation.violationHistory': {
                    $each: [latestViolation],
                    $slice: -Math.max(10, MAX_VIOLATION_HISTORY),
                },
            },
        }
    );

    if (notify) {
        await createNotification(
            user._id,
            'Cảnh báo vi phạm tiêu chuẩn cộng đồng',
            'Chúng tôi đã xác nhận một vi phạm liên quan đến tài khoản của bạn. Vui lòng xem lại tiêu chuẩn cộng đồng và không tái phạm.',
            `${process.env.FRONTEND_URL}/notification`,
            {
                type: 'moderation-violation',
                actorId,
                metadata: {
                    source,
                    count,
                    threshold: LOCK_THRESHOLD,
                    reason: normalizedReason,
                    ...metadata,
                },
            }
        );
    }

    let locked = false;
    if (willLock) {
        await lockAccount({
            userId,
            adminId: actorId,
            reason: 'Tài khoản bị khóa do có vi phạm lặp lại tiêu chuẩn cộng đồng.',
        });
        locked = true;
    }

    return {
        count,
        threshold: LOCK_THRESHOLD,
        locked,
        blockedUntil: null,
        decayDays: 7,
        nextDecayAt: violationState.nextDecayAt,
        latestViolation: serializeViolationHistoryItem(latestViolation),
    };
}

export async function clearViolations(userId) {
    if (isRedisReady) {
        await redis.del(violationKey(userId));
    }

    await User.findByIdAndUpdate(userId, {
        $set: {
            'moderation.violationCountCache': 0,
            'moderation.lastViolationAt': null,
            'moderation.nextViolationDecayAt': null,
        },
    });
}
