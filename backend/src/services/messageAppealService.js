import mongoose from 'mongoose';
import Message from '../models/messageModel.js';
import Conversation from '../models/conversationModel.js';
import MessageAppeal, { MESSAGE_APPEAL_STATUSES } from '../models/messageAppealModel.js';
import {
    generateSignedUrl,
    resolveLastMessagePreview,
} from '../utils/messageHelper.js';
import { decryptConversationPayload, decryptMessagePayload } from '../utils/messageCrypto.js';
import { replaceMentionTags } from '../utils/mentions.js';
import { invalidateConversationReadCache } from '../utils/readCache.js';

export const MESSAGE_APPEAL_REASON_MIN_LENGTH = 10;
export const MESSAGE_APPEAL_REASON_MAX_LENGTH = 2000;
export const MESSAGE_APPEAL_ADMIN_NOTE_MAX_LENGTH = 1000;
export const MODERATED_MESSAGE_PLACEHOLDER = 'Tin nhắn vi phạm tiêu chuẩn cộng đồng';

function makeError(message, statusCode = 400, extras = {}) {
    const error = new Error(message);
    error.statusCode = statusCode;
    Object.assign(error, extras);
    return error;
}

function requireObjectId(value, name) {
    if (!mongoose.Types.ObjectId.isValid(value)) {
        throw makeError(`${name} không hợp lệ.`, 400);
    }
}

function normalizeText(value, maxLength) {
    return String(value || '').trim().slice(0, maxLength);
}

function normalizeReason(value) {
    const reason = String(value || '').trim();
    if (reason.length < MESSAGE_APPEAL_REASON_MIN_LENGTH) {
        throw makeError(`Vui lòng mô tả lý do kháng cáo ít nhất ${MESSAGE_APPEAL_REASON_MIN_LENGTH} ký tự.`, 400);
    }
    if (reason.length > MESSAGE_APPEAL_REASON_MAX_LENGTH) {
        throw makeError(`Nội dung kháng cáo không được vượt quá ${MESSAGE_APPEAL_REASON_MAX_LENGTH} ký tự.`, 400);
    }
    return reason;
}

function metadataObject(messageOrMetadata) {
    const metadata = messageOrMetadata?.metadata ?? messageOrMetadata;
    if (!metadata) return {};
    if (metadata instanceof Map) return Object.fromEntries(metadata);
    return metadata;
}

function idString(value) {
    return value?._id?.toString?.() || value?.toString?.() || String(value || '');
}

function isAiModeratedViolation(message) {
    const metadata = metadataObject(message);
    return Boolean(
        message?.reportStatus === true
        && (
            metadata.moderationStatus === 'rejected'
            || metadata.imageModerationStatus === 'rejected'
        )
    );
}

function toUserSummary(user) {
    if (!user || typeof user !== 'object') return null;
    return {
        _id: user._id,
        displayName: user.displayName,
        email: user.email,
        avatarUrl: user.avatarUrl,
        lock: user.lock,
        moderation: user.moderation,
    };
}

export function serializeMessageAppealForUser(appeal) {
    if (!appeal) return null;
    return {
        _id: appeal._id,
        messageId: appeal.messageId,
        status: appeal.status,
        reason: appeal.reason,
        reviewedAt: appeal.reviewedAt || null,
        adminNote: appeal.adminNote || '',
        createdAt: appeal.createdAt,
        updatedAt: appeal.updatedAt,
    };
}

export async function attachAppealsToMessages(messages = [], userId) {
    const requesterId = idString(userId);
    if (!requesterId || !Array.isArray(messages) || messages.length === 0) {
        return messages;
    }

    const messageIds = messages
        .filter((message) => idString(message?.senderId) === requesterId)
        .map((message) => message?._id)
        .filter(Boolean);

    if (messageIds.length === 0) return messages;

    const appeals = await MessageAppeal.find({
        requesterId,
        messageId: { $in: messageIds },
    })
        .select('_id messageId status reason reviewedAt adminNote createdAt updatedAt')
        .lean();

    const appealByMessageId = new Map(
        appeals.map((appeal) => [idString(appeal.messageId), serializeMessageAppealForUser(appeal)])
    );

    return messages.map((message) => {
        const appeal = appealByMessageId.get(idString(message?._id));
        return appeal ? { ...message, appeal } : message;
    });
}

async function emitAppealUpdateToRequester(appeal, conversationId) {
    if (!appeal?.requesterId) return;
    const { emitToUser } = await import('../socket/index.js');
    await emitToUser(idString(appeal.requesterId), 'message-appeal-updated', {
        conversationId: conversationId ? idString(conversationId) : null,
        messageId: idString(appeal.messageId),
        appeal: serializeMessageAppealForUser(appeal),
    });
}

function serializeMessageForClient(message) {
    const raw = decryptMessagePayload(message);
    if (!raw) return raw;
    const { searchContent, ...safeMessage } = raw;
    return {
        ...safeMessage,
        signedUrl: raw.filePublicId ? generateSignedUrl(raw.filePublicId, raw.type) : null,
    };
}

async function restoreConversationLastMessage(updatedMessage) {
    const conversation = await Conversation.findById(updatedMessage.conversationId);
    if (!conversation) return null;

    if (conversation.lastMessage?._id?.toString?.() !== updatedMessage._id.toString()) {
        invalidateConversationReadCache(conversation);
        return null;
    }

    const rawMessage = decryptMessagePayload(updatedMessage);
    const metadata = metadataObject(rawMessage);

    conversation.lastMessage.content = resolveLastMessagePreview(rawMessage);
    conversation.lastMessage.type = rawMessage.type || 'text';
    conversation.lastMessage.metadata = Object.keys(metadata).length > 0 ? metadata : undefined;
    conversation.lastMessage.mentions = rawMessage.mentions?.length ? rawMessage.mentions : undefined;
    conversation.lastMessage.deliveredTo = rawMessage.deliveredTo?.length ? rawMessage.deliveredTo : undefined;
    conversation.lastMessage.expiresAt = rawMessage.expiresAt || undefined;
    conversation.lastMessage.isExpired = rawMessage.isExpired === true ? true : undefined;
    await conversation.save();

    invalidateConversationReadCache(conversation);
    return decryptConversationPayload(conversation).lastMessage || null;
}

function buildOriginalContent(message) {
    const content = replaceMentionTags(message.content || '', message.mentions).trim();
    const fileName = message.fileName || '';

    switch (message.type) {
        case 'image':
            return [content || 'Ảnh đính kèm', fileName].filter(Boolean).join('\n');
        case 'file':
            return [content, fileName || 'File đính kèm'].filter(Boolean).join('\n');
        case 'audio':
            return content || fileName || 'Tin nhắn thoại';
        case 'sticker':
            return content || 'Nhãn dán';
        case 'link':
        case 'text':
        default:
            return content || fileName || '';
    }
}

function serializeAdminMessage(message) {
    if (!message) return null;
    const raw = decryptMessagePayload(message);
    const metadata = metadataObject(raw);
    const originalContent = buildOriginalContent(raw);
    const aiReason = metadata.moderationReason || metadata.imageModerationReason || '';

    return {
        _id: raw._id,
        conversationId: raw.conversationId,
        senderId: raw.senderId,
        senderInfo: raw.senderInfo || null,
        type: raw.type,
        content: raw.content || '',
        originalContent,
        displayContent: raw.reportStatus ? MODERATED_MESSAGE_PLACEHOLDER : originalContent,
        fileName: raw.fileName || '',
        mimeType: raw.mimeType || '',
        fileSize: raw.fileSize || 0,
        signedUrl: raw.filePublicId ? generateSignedUrl(raw.filePublicId, raw.type) : null,
        mentions: raw.mentions || [],
        reportStatus: Boolean(raw.reportStatus),
        aiModeration: {
            status: metadata.moderationStatus || metadata.imageModerationStatus || '',
            category: metadata.moderationCategory || metadata.imageModerationCategory || '',
            reason: aiReason,
            source: metadata.moderationSource || '',
            confidence: metadata.moderationConfidence ?? null,
        },
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
    };
}

function serializeConversation(conversation) {
    if (!conversation) return null;
    const raw = decryptConversationPayload(conversation);
    const participants = raw.participants || [];
    const participantNames = participants
        .map((participant) => participant.userId?.displayName || participant.userInfo?.displayName)
        .filter(Boolean);

    return {
        _id: raw._id,
        type: raw.type,
        title: raw.type === 'group'
            ? raw.group?.name || 'Nhóm chưa đặt tên'
            : participantNames.slice(0, 2).join(' - ') || 'Tin nhắn riêng',
        group: raw.group || null,
        participantCount: participants.length,
        disbanded: raw.disbanded === true,
    };
}

function serializeMessageAppealForAdmin(appeal, message, conversation) {
    const requester = toUserSummary(appeal.requesterId);
    return {
        _id: appeal._id,
        requesterId: requester || appeal.requesterId,
        messageId: appeal.messageId,
        reason: appeal.reason,
        status: appeal.status,
        reviewedBy: toUserSummary(appeal.reviewedBy) || appeal.reviewedBy || null,
        reviewedAt: appeal.reviewedAt || null,
        adminNote: appeal.adminNote || '',
        createdAt: appeal.createdAt,
        updatedAt: appeal.updatedAt,
        message: serializeAdminMessage(message),
        conversation: serializeConversation(conversation),
    };
}

async function hydrateMessageAppealsForAdmin(appeals) {
    const messageIds = appeals.map((appeal) => appeal.messageId).filter(Boolean);
    const messages = messageIds.length > 0
        ? await Message.find({ _id: { $in: messageIds } }).lean()
        : [];
    const messageById = new Map(messages.map((message) => [idString(message._id), message]));

    const conversationIds = [
        ...new Set(messages.map((message) => idString(message.conversationId)).filter(Boolean)),
    ];
    const conversations = conversationIds.length > 0
        ? await Conversation.find({ _id: { $in: conversationIds } })
            .populate('participants.userId', 'displayName email avatarUrl lock moderation')
            .lean()
        : [];
    const conversationById = new Map(conversations.map((conversation) => [idString(conversation._id), conversation]));

    return appeals.map((appeal) => {
        const message = messageById.get(idString(appeal.messageId)) || null;
        const conversation = message ? conversationById.get(idString(message.conversationId)) || null : null;
        return serializeMessageAppealForAdmin(appeal, message, conversation);
    });
}

export async function createMessageAppeal({ messageId, requesterId, reason }) {
    requireObjectId(messageId, 'messageId');
    const normalizedReason = normalizeReason(reason);

    const message = await Message.findById(messageId);
    if (!message) {
        throw makeError('Không tìm thấy tin nhắn.', 404);
    }

    if (message.senderId.toString() !== requesterId.toString()) {
        throw makeError('Bạn chỉ có thể kháng cáo tin nhắn của chính mình.', 403);
    }

    if (message.isRecalled) {
        throw makeError('Không thể kháng cáo tin nhắn đã thu hồi.', 400);
    }

    if (!isAiModeratedViolation(message)) {
        throw makeError('Chỉ tin nhắn bị AI đánh dấu vi phạm mới có thể kháng cáo.', 400);
    }

    const existing = await MessageAppeal.findOne({ messageId }).lean();
    if (existing) {
        throw makeError(
            'Tin nhắn này đã có kháng cáo. Vui lòng chờ kết quả xử lý.',
            409,
            { code: 'MESSAGE_APPEAL_EXISTS', appeal: serializeMessageAppealForUser(existing) }
        );
    }

    try {
        const appeal = await MessageAppeal.create({
            requesterId,
            messageId,
            reason: normalizedReason,
        });

        await emitAppealUpdateToRequester(appeal, message.conversationId);
        return serializeMessageAppealForUser(appeal.toObject ? appeal.toObject() : appeal);
    } catch (error) {
        if (error?.code === 11000) {
            const duplicate = await MessageAppeal.findOne({ messageId }).lean();
            throw makeError(
                'Tin nhắn này đã có kháng cáo. Vui lòng chờ kết quả xử lý.',
                409,
                { code: 'MESSAGE_APPEAL_EXISTS', appeal: serializeMessageAppealForUser(duplicate) }
            );
        }
        throw error;
    }
}

export async function listMessageAppealsForAdmin({ status = '', page = 1, limit = 20 } = {}) {
    const normalizedStatus = String(status || '').trim();
    const filter = {};
    if (normalizedStatus) {
        if (!MESSAGE_APPEAL_STATUSES.includes(normalizedStatus)) {
            throw makeError('Trạng thái kháng cáo không hợp lệ.', 400);
        }
        filter.status = normalizedStatus;
    }

    const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 20));
    const skip = (safePage - 1) * safeLimit;

    const [appeals, total] = await Promise.all([
        MessageAppeal.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(safeLimit)
            .populate('requesterId', 'displayName email avatarUrl lock moderation')
            .populate('reviewedBy', 'displayName email avatarUrl')
            .lean(),
        MessageAppeal.countDocuments(filter),
    ]);

    const hydratedAppeals = await hydrateMessageAppealsForAdmin(appeals);
    return {
        appeals: hydratedAppeals,
        pagination: {
            page: safePage,
            limit: safeLimit,
            total,
            totalPages: Math.ceil(total / safeLimit),
        },
    };
}

export async function reviewMessageAppeal({ appealId, action, adminId, adminNote = '' }) {
    requireObjectId(appealId, 'appealId');
    const normalizedAction = String(action || '').trim();
    const note = normalizeText(adminNote, MESSAGE_APPEAL_ADMIN_NOTE_MAX_LENGTH);

    if (!['approve', 'reject'].includes(normalizedAction)) {
        throw makeError('Hành động kháng cáo không hợp lệ.', 400);
    }

    const appeal = await MessageAppeal.findById(appealId);
    if (!appeal) {
        throw makeError('Không tìm thấy kháng cáo.', 404);
    }

    if (appeal.status !== 'pending') {
        throw makeError('Kháng cáo này đã được xử lý.', 409);
    }

    const message = await Message.findById(appeal.messageId);
    if (!message) {
        throw makeError('Không tìm thấy tin nhắn cần xử lý.', 404);
    }

    const now = new Date();
    appeal.status = normalizedAction === 'approve' ? 'approved' : 'rejected';
    appeal.reviewedBy = adminId;
    appeal.reviewedAt = now;
    appeal.adminNote = note;
    await appeal.save();

    let restoredMessage = null;
    let restoredLastMessage = null;

    if (normalizedAction === 'approve') {
        const updateFields = {
            reportStatus: false,
            'metadata.moderationStatus': 'appeal_approved',
            'metadata.moderationAppealId': appeal._id.toString(),
            'metadata.moderationAppealReviewedAt': now.toISOString(),
        };
        if (message.type === 'image') {
            updateFields['metadata.imageModerationStatus'] = 'appeal_approved';
        }

        restoredMessage = await Message.findByIdAndUpdate(
            message._id,
            { $set: updateFields },
            { new: true }
        );

        if (restoredMessage) {
            const { io } = await import('../socket/index.js');
            restoredLastMessage = await restoreConversationLastMessage(restoredMessage);
            io.to(restoredMessage.conversationId.toString()).emit('message-restored', {
                conversationId: restoredMessage.conversationId.toString(),
                messageId: restoredMessage._id.toString(),
                message: serializeMessageForClient(restoredMessage),
                lastMessage: restoredLastMessage,
            });
        }
    } else {
        const conversation = await Conversation.findById(message.conversationId).select('_id participants').lean();
        invalidateConversationReadCache(conversation || message.conversationId, [appeal.requesterId]);
    }

    await emitAppealUpdateToRequester(appeal, message.conversationId);

    const { createNotification } = await import('./notificationServices.js');
    await createNotification(
        appeal.requesterId,
        normalizedAction === 'approve' ? 'Kháng cáo tin nhắn đã được chấp nhận' : 'Kháng cáo tin nhắn đã bị từ chối',
        normalizedAction === 'approve'
            ? 'Admin đã xác nhận AI nhận diện nhầm. Tin nhắn của bạn đã được khôi phục.'
            : (note || 'Admin đã xem xét và giữ nguyên kết luận vi phạm của AI.'),
        `${process.env.FRONTEND_URL}/chat?conversationId=${message.conversationId.toString()}&messageId=${message._id.toString()}`,
        {
            type: 'message-appeal-result',
            targetId: message._id,
            actorId: adminId,
            metadata: {
                appealId: appeal._id,
                action: normalizedAction,
                status: appeal.status,
                conversationId: message.conversationId,
            },
        }
    );

    const [hydrated] = await hydrateMessageAppealsForAdmin([
        await MessageAppeal.findById(appeal._id)
            .populate('requesterId', 'displayName email avatarUrl lock moderation')
            .populate('reviewedBy', 'displayName email avatarUrl')
            .lean(),
    ]);

    return {
        appeal: hydrated,
        restoredMessage: restoredMessage ? serializeMessageForClient(restoredMessage) : null,
        lastMessage: restoredLastMessage,
    };
}
