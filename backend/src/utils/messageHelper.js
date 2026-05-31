import { v2 as cloudinary } from 'cloudinary';
import { decryptConversationPayload, decryptMessagePayload } from './messageCrypto.js';
import { replaceMentionTags } from './mentions.js';
import { invalidateConversationReadCache } from './readCache.js';
import {
    DISAPPEARED_MESSAGE_PLACEHOLDER,
    sanitizeExpiredMessageForClient,
} from './disappearingMessages.js';

export { replaceMentionTags };

const resolveLastMessagePreview = (rawMessage) => {
    const message = decryptMessagePayload(rawMessage);
    if (message.isExpired) return DISAPPEARED_MESSAGE_PLACEHOLDER;
    if (message.isRecalled) return 'Tin nhắn đã được thu hồi';

    switch (message.type) {
        case 'image': return message.content || 'Đã gửi một ảnh';
        case 'sticker': return 'Đã gửi một nhãn dán';
        case 'file': return message.content || message.fileName || 'Tệp đính kèm';
        case 'audio': return 'Tin nhắn thoại';
        case 'link': return 'Đã gửi một liên kết';
        case 'system': {
            const systemType = message.systemType;
            if (!systemType) return message.content || 'Thông báo hệ thống';

            const metadata = message.metadata instanceof Map ? Object.fromEntries(message.metadata) : (message.metadata || {});

            switch (systemType) {
                case 'member_added':
                    return `Đã thêm ${metadata.addedUserNames || 'thành viên mới'} vào nhóm`;
                case 'member_kicked':
                    return `Đã xóa ${metadata.kickedUserName || 'một thành viên'} khỏi nhóm`;
                case 'group_disbanded':
                    return 'Nhóm đã bị giải tán';
                case 'member_left':
                    return `${metadata.userName || 'Một thành viên'} đã rời khỏi nhóm`;
                case 'call_started':
                    return 'Cuộc gọi đã bắt đầu';
                case 'call_ended':
                    return 'Cuộc gọi đã kết thúc';
                case 'call': {
                    const callTypeLabel = metadata.callType === 'video' ? 'Cuộc gọi video' : 'Cuộc gọi thoại';
                    if (metadata.mode === 'group') {
                        return `${callTypeLabel} nhóm`;
                    }
                    return callTypeLabel;
                }
                case 'admin_transferred':
                    return `${metadata.appointedByInfo?.displayName || 'Một quản trị viên'} đã chuyển quyền trưởng nhóm cho ${metadata.appointedUserInfo?.displayName || 'một thành viên'}`;
                case 'group_avatar_updated':
                    return `${metadata.updatedByName || 'Một thành viên'} đã đổi ảnh đại diện nhóm`;
                case 'group_name_updated':
                    return `${metadata.updatedByName || 'Một thành viên'} đã đổi tên nhóm${metadata.newName ? ` thành ${metadata.newName}` : ''}`;
                case 'message_pinned':
                    return `${metadata.actionByName || 'Một thành viên'} đã ghim một tin nhắn`;
                case 'message_unpinned':
                    return `${metadata.actionByName || 'Một thành viên'} đã bỏ ghim một tin nhắn`;
                case 'reminder_created_local':
                    return metadata.reminderContent
                        ? `Bạn đã tạo nhắc hẹn mới: ${metadata.reminderContent}`
                        : 'Bạn đã tạo nhắc hẹn mới';
                case 'shared_reminder_created':
                    return metadata.reminderContent
                        ? `Đã tạo nhắc hẹn chung: ${metadata.reminderContent}`
                        : 'Đã tạo nhắc hẹn chung';
                case 'shared_reminder_participation_changed': {
                    const actorName = metadata.actorName || 'Một thành viên';
                    const action = metadata.action;
                    if (action === 'joined') {
                        return `${actorName} đã tham gia nhắc hẹn`;
                    }
                    if (action === 'declined') {
                        return `${actorName} đã từ chối tham gia nhắc hẹn`;
                    }
                    return message.content || 'Cập nhật tham gia nhắc hẹn chung';
                }
                case 'shared_reminder_cancelled': {
                    const actorName = metadata.actorName || 'Một thành viên';
                    return metadata.reminderContent
                        ? `${actorName} đã hủy nhắc hẹn chung: ${metadata.reminderContent}`
                        : `${actorName} đã hủy nhắc hẹn chung`;
                }
                case 'shared_reminder_updated': {
                    const actorName = metadata.actorName || 'Một thành viên';
                    return metadata.reminderContent
                        ? `${actorName} đã chỉnh sửa nhắc hẹn chung: ${metadata.reminderContent}`
                        : `${actorName} đã chỉnh sửa nhắc hẹn chung`;
                }
                default:
                    return message.content || 'Thông báo hệ thống';
            }
        }
        default: {
            const rawContent = message.content?.trim() || '';
            return replaceMentionTags(rawContent, message.mentions);
        }
    }
};

function ensureUnreadCounts(conversation) {
    if (!conversation.unreadCounts || typeof conversation.unreadCounts.get !== 'function') {
        conversation.unreadCounts = new Map();
    }
    return conversation.unreadCounts;
}

export const updateConversationLastMessage = (conversation, message, senderId) => {
    const safeMessage = decryptMessagePayload(message);
    const metadata = safeMessage.metadata instanceof Map ? Object.fromEntries(safeMessage.metadata) : (safeMessage.metadata || null);
    const visibleToUserIds = Array.isArray(metadata?.visibleToUserIds)
        ? metadata.visibleToUserIds.map((id) => id.toString())
        : [];
    const hasVisibilityFilter = visibleToUserIds.length > 0;
    const lastMessage = {
        _id: safeMessage._id,
        content: resolveLastMessagePreview(safeMessage),
        type: safeMessage.type ?? 'text',
        senderId: senderId,
        createdAt: safeMessage.createdAt,
    };

    if (safeMessage.systemType) lastMessage.systemType = safeMessage.systemType;
    if (metadata) lastMessage.metadata = metadata;
    if (safeMessage.mentions?.length) lastMessage.mentions = safeMessage.mentions;
    if (safeMessage.deliveredTo?.length) lastMessage.deliveredTo = safeMessage.deliveredTo;
    if (safeMessage.expiresAt) lastMessage.expiresAt = safeMessage.expiresAt;
    if (safeMessage.isExpired) lastMessage.isExpired = true;

    conversation.set({ lastMessage });

    const unreadCounts = ensureUnreadCounts(conversation);
    conversation.participants.forEach((participant) => {
        const userIdObj = participant.userId;
        const memberId = (userIdObj._id || userIdObj).toString();
        const isVisibleToMember = !hasVisibilityFilter || visibleToUserIds.includes(memberId);
        if (!isVisibleToMember) {
            return;
        }

        const isSender = memberId === senderId.toString();
        const prevCount = unreadCounts.get(memberId) || 0;
        unreadCounts.set(memberId, isSender ? 0 : prevCount + 1);
    });

    const senderIdStr = senderId.toString();
    const senderParticipant = conversation.participants.find(
        (p) => (p.userId._id || p.userId).toString() === senderIdStr
    );
    if (senderParticipant) {
        senderParticipant.lastReadMessageId = safeMessage._id;
        senderParticipant.lastReadAt = new Date();
    }
    conversation.markModified('participants');
    invalidateConversationReadCache(conversation);
};

export const emitNewMessage = (io, conversation, message, signedUrl = null) => {
    const payloadMessage = sanitizeExpiredMessageForClient(decryptMessagePayload(message));
    payloadMessage.signedUrl = signedUrl ?? null;

    const safeConversation = decryptConversationPayload(conversation);
    const lastMsgPayload = safeConversation.lastMessage
        ? { ...safeConversation.lastMessage }
        : safeConversation.lastMessage;

    io.to(conversation._id.toString()).emit('new-message', {
        message: payloadMessage,
        conversation: {
            _id: conversation._id,
            lastMessage: lastMsgPayload,
            lastMessageAt: conversation.lastMessageAt,
        },
        unreadCounts: conversation.unreadCounts,
    });
};

export async function safeUpload(uploadFn, ...args) {
    try {
        return await uploadFn(...args);
    } catch (err) {
        const msg = err?.message ?? '';
        if (msg.includes('File size too large') || msg.includes('exceeds') || err?.http_code === 400) {
            const e = new Error('File quá lớn để upload lên cloud. Vui lòng chọn file nhỏ hơn.');
            e.statusCode = 413;
            throw e;
        }
        throw err;
    }
}

export function generateSignedUrl(filePublicId, type = 'image') {
    if (!filePublicId) return null;
    let resource_type = 'raw';
    if (type === 'image') resource_type = 'image';
    if (type === 'audio') resource_type = 'raw';

    const timestamp = Math.round(Date.now() / 1000) + 3600;

    return cloudinary.utils.private_download_url(filePublicId, '', {
        resource_type,
        type: 'authenticated',
        expires_at: timestamp,
        secure: true
    });
}
