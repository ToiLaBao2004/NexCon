import crypto from 'crypto';
import redis, { isRedisReady } from '../../config/redis.js';
import User from '../../models/userModel.js';
import Session from '../../models/sessionModel.js';
import { createNotification } from '../notificationServices.js';
import { disconnectUserSockets } from '../../socket/index.js';

const VIOLATION_DECAY_MS = 7 * 24 * 60 * 60 * 1000;
const VIOLATION_DECAY_SECONDS = Math.floor(VIOLATION_DECAY_MS / 1000);
const LOCK_THRESHOLD = Number.parseInt(process.env.VIOLATION_LOCK_THRESHOLD || '5', 10);

function violationKey(userId) {
    return `moderation:violations:${userId.toString()}`;
}

function normalizeReason(reason) {
    return String(reason || 'Vi phạm tiêu chuẩn cộng đồng.').trim().slice(0, 1000);
}

function buildLockNotice() {
    return 'Tài khoản của bạn đã bị khóa sau khi chúng tôi xem xét vi phạm. Nếu cho rằng quyết định này nhầm lẫn, bạn có thể gửi kháng cáo từ màn hình đăng nhập.';
}

async function pruneExpiredViolations(userId) {
    if (!isRedisReady) return;
    const minScore = Date.now() - VIOLATION_DECAY_MS;
    await redis.zRemRangeByScore(violationKey(userId), 0, minScore);
}

async function readRedisViolationCount(userId) {
    await pruneExpiredViolations(userId);
    return redis.zCard(violationKey(userId));
}

export async function getViolationSummary(userId) {
    if (isRedisReady) {
        const count = await readRedisViolationCount(userId);
        const ttlSeconds = await redis.ttl(violationKey(userId));

        return {
            count,
            threshold: LOCK_THRESHOLD,
            decayDays: 7,
            nextDecayAt: ttlSeconds > 0
                ? new Date(Date.now() + Math.min(ttlSeconds, VIOLATION_DECAY_SECONDS) * 1000)
                : null,
            source: 'redis',
        };
    }

    const user = await User.findById(userId).select('moderation').lean();
    return {
        count: user?.moderation?.violationCountCache || 0,
        threshold: LOCK_THRESHOLD,
        decayDays: 7,
        nextDecayAt: null,
        source: 'mongo-cache',
    };
}

export async function lockAccount({ userId, adminId = null, reason = '' }) {
    const lockReason = normalizeReason(reason || 'Tài khoản bị khóa do vượt ngưỡng vi phạm.');
    const current = await User.findById(userId).select('lock').lean();
    const wasLocked = Boolean(current?.lock?.isLocked);
    const user = await User.findByIdAndUpdate(
        userId,
        {
            $set: {
                'lock.isLocked': true,
                'lock.lockedAt': new Date(),
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
            'moderation.violationCountCache': resetViolations ? 0 : undefined,
        },
    };

    if (resetViolations) {
        update.$set['moderation.lastViolationAt'] = null;
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

    if (isRedisReady) {
        const key = violationKey(userId);
        await pruneExpiredViolations(userId);
        await redis.zAdd(key, {
            score: Date.now(),
            value: `${Date.now()}-${crypto.randomUUID()}`,
        });
        await redis.expire(key, VIOLATION_DECAY_SECONDS * 2);
        count = await redis.zCard(key);
    } else {
        const updated = await User.findByIdAndUpdate(
            userId,
            {
                $inc: { 'moderation.violationCountCache': 1 },
                $set: { 'moderation.lastViolationAt': new Date() },
            },
            { new: true }
        ).select('moderation');
        count = updated?.moderation?.violationCountCache || 1;
    }

    const user = await User.findByIdAndUpdate(
        userId,
        {
            $set: {
                'moderation.violationCountCache': count,
                'moderation.lastViolationAt': new Date(),
            },
        },
        { new: true }
    ).select('_id displayName email lock moderation role');

    if (!user) {
        const error = new Error('User not found.');
        error.statusCode = 404;
        throw error;
    }

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
    if (count >= LOCK_THRESHOLD && !user.lock?.isLocked) {
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
        decayDays: 7,
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
        },
    });
}
