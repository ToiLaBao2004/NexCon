import Conversation from '../models/conversationModel.js';
import Message from '../models/messageModel.js';
import redisIOClient from '../config/redisIOClient.js';
import { deleteCloudinaryResource } from '../middlewares/uploadMiddleware.js';
import { getSocketGateway } from '../socket/socketGateway.js';
import { invalidateConversationReadCache } from '../utils/readCache.js';
import {
    DISAPPEARED_MESSAGE_PLACEHOLDER,
    sanitizeExpiredMessageForClient,
} from '../utils/disappearingMessages.js';

const EXPIRY_BATCH_SIZE = 200;
const MAX_EXPIRY_BATCHES_PER_RUN = 10;
const COUNTDOWN_CACHE_PREFIX = 'dm:disappearing:countdown:';

function countdownCacheKey(messageId) {
    return `${COUNTDOWN_CACHE_PREFIX}${messageId.toString()}`;
}

function getCloudinaryResource(message) {
    if (!message?.filePublicId) return null;

    if (message.type === 'image') {
        return {
            publicId: message.filePublicId,
            resourceType: 'image',
            deliveryType: 'authenticated',
        };
    }

    if (message.type === 'file' || message.type === 'audio') {
        return {
            publicId: message.filePublicId,
            resourceType: 'raw',
            deliveryType: 'authenticated',
        };
    }

    return null;
}

async function deleteCountdownCache(messageId) {
    if (!messageId || redisIOClient.status !== 'ready') return;
    await redisIOClient.del(countdownCacheKey(messageId)).catch(() => null);
}

export async function cacheMessageCountdown(message) {
    if (!message?._id || !message.expiresAt || redisIOClient.status !== 'ready') return;

    const ttlSeconds = Math.max(
        1,
        Math.ceil((new Date(message.expiresAt).getTime() - Date.now()) / 1000)
    );

    await redisIOClient.set(
        countdownCacheKey(message._id),
        new Date(message.expiresAt).toISOString(),
        'EX',
        ttlSeconds,
    ).catch(() => null);
}

async function updateLastMessagePlaceholder(message) {
    const conversation = await Conversation.findById(message.conversationId);
    if (!conversation) return null;

    if (conversation.lastMessage?._id?.toString?.() === message._id.toString()) {
        conversation.lastMessage.content = DISAPPEARED_MESSAGE_PLACEHOLDER;
        conversation.lastMessage.isExpired = true;
        conversation.lastMessage.expiresAt = message.expiresAt;
        await conversation.save();
    }

    invalidateConversationReadCache(conversation);
    return conversation;
}

async function hasActiveMediaReference(message) {
    if (!message.filePublicId) return false;

    return Boolean(await Message.exists({
        _id: { $ne: message._id },
        filePublicId: message.filePublicId,
        isExpired: { $ne: true },
        isRecalled: { $ne: true },
    }));
}

async function cleanupExpiredMedia(message) {
    const resource = getCloudinaryResource(message);
    if (!resource) {
        await Message.updateOne(
            { _id: message._id },
            { $set: { expiryMediaCleanupStatus: 'skipped' } },
        );
        return 'skipped';
    }

    if (await hasActiveMediaReference(message)) {
        await Message.updateOne(
            { _id: message._id },
            { $set: { expiryMediaCleanupStatus: 'skipped' } },
        );
        return 'skipped';
    }

    try {
        await deleteCloudinaryResource(
            resource.publicId,
            resource.resourceType,
            resource.deliveryType,
        );
        await Message.updateOne(
            { _id: message._id },
            { $set: { expiryMediaCleanupStatus: 'completed' } },
        );
        return 'completed';
    } catch (error) {
        await Message.updateOne(
            { _id: message._id },
            { $set: { expiryMediaCleanupStatus: 'failed' } },
        );
        console.warn('[DisappearingMessages] Cannot delete expired media:', error?.message || error);
        return 'failed';
    }
}

function emitExpiredMessage(message, conversation = null, io = getSocketGateway().io) {
    if (!io) return;

    const conversationId = message.conversationId.toString();
    io.to(conversationId).emit('dm:message-expired', {
        conversationId,
        messageId: message._id.toString(),
        expiredAt: message.expiredAt,
        placeholder: DISAPPEARED_MESSAGE_PLACEHOLDER,
    });

    if (conversation?.lastMessage?._id?.toString?.() === message._id.toString()) {
        io.to(conversationId).emit('conversation-updated', {
            conversationId,
            conversation: {
                _id: conversation._id,
                lastMessage: conversation.lastMessage,
            },
        });
    }
}

export async function expireMessageById(messageId, {
    now = new Date(),
    force = false,
    io = getSocketGateway().io,
} = {}) {
    const expiryTime = new Date(now);
    const query = {
        _id: messageId,
        isExpired: { $ne: true },
        type: { $ne: 'system' },
    };
    if (!force) {
        query.expiresAt = { $lte: expiryTime };
    }

    const message = await Message.findOneAndUpdate(
        query,
        {
            $set: {
                isExpired: true,
                expiredAt: expiryTime,
                isPinned: false,
                pinnedAt: null,
                reactions: [],
                expiryMediaCleanupStatus: 'pending',
            },
            $unset: {
                searchContent: 1,
            },
        },
        { new: true },
    ).lean();

    if (!message) return null;

    const conversation = await updateLastMessagePlaceholder(message);
    await deleteCountdownCache(message._id);
    await cleanupExpiredMedia(message);
    emitExpiredMessage(message, conversation, io);

    return sanitizeExpiredMessageForClient(message);
}

export async function retryFailedExpiredMediaCleanup({ limit = EXPIRY_BATCH_SIZE } = {}) {
    const messages = await Message.find({
        isExpired: true,
        filePublicId: { $exists: true, $ne: null },
        expiryMediaCleanupStatus: { $in: ['pending', 'failed'] },
    })
        .select('_id type filePublicId')
        .limit(limit)
        .lean();

    await Promise.allSettled(messages.map((message) => cleanupExpiredMedia(message)));
    return messages.length;
}

export async function expireDueMessages({
    now = new Date(),
    batchSize = EXPIRY_BATCH_SIZE,
    maxBatches = MAX_EXPIRY_BATCHES_PER_RUN,
    io = getSocketGateway().io,
} = {}) {
    const expiryTime = new Date(now);
    let expiredCount = 0;

    for (let batch = 0; batch < maxBatches; batch += 1) {
        const dueMessages = await Message.find({
            isExpired: { $ne: true },
            expiresAt: { $lte: expiryTime },
            type: { $ne: 'system' },
        })
            .select('_id')
            .sort({ expiresAt: 1, _id: 1 })
            .limit(batchSize)
            .lean();

        if (!dueMessages.length) break;

        const results = await Promise.allSettled(
            dueMessages.map((message) => expireMessageById(message._id, { now: expiryTime, io }))
        );
        expiredCount += results.filter(
            (result) => result.status === 'fulfilled' && result.value
        ).length;

        if (dueMessages.length < batchSize) break;
    }

    const retriedMediaCount = await retryFailedExpiredMediaCleanup({ limit: batchSize });
    return { expiredCount, retriedMediaCount };
}
