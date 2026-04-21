import { v2 as cloudinary } from 'cloudinary';

const resolveLastMessagePreview = (message) => {
    if (message.type !== 'system' && message.content?.trim()) return message.content.trim();

    switch (message.type) {
        case 'image': return 'Đã gửi một ảnh';
        case 'file': return message.fileName || 'Tệp đính kèm';
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
                    return `Nhóm đã bị giải tán`;
                case 'member_left':
                    return `${metadata.userName || 'Một thành viên'} đã rời khỏi nhóm`;
                case 'call_started':
                    return `Cuộc gọi đã bắt đầu`;
                case 'call_ended':
                    return `Cuộc gọi đã kết thúc`;
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
        default: return message.content?.trim() || '';
    }
};

export const updateConversationLastMessage = (conversation, message, senderId) => {
    const metadata = message.metadata instanceof Map ? Object.fromEntries(message.metadata) : (message.metadata || null);
    const visibleToUserIds = Array.isArray(metadata?.visibleToUserIds)
        ? metadata.visibleToUserIds.map((id) => id.toString())
        : [];
    const hasVisibilityFilter = visibleToUserIds.length > 0;

    conversation.set({
        lastMessage: {
            content: resolveLastMessagePreview(message),
            type: message.type ?? 'text',
            systemType: message.systemType || null,
            metadata: metadata,
            senderId: senderId,
            createdAt: message.createdAt,
        },
    });

    conversation.participants.forEach((participant) => {
        const userIdObj = participant.userId;
        const memberId = (userIdObj._id || userIdObj).toString();
        const isVisibleToMember = !hasVisibilityFilter || visibleToUserIds.includes(memberId);
        if (!isVisibleToMember) {
            return;
        }

        const isSender = memberId === senderId.toString();
        const prevCount = conversation.unreadCounts?.get(memberId) || 0;
        conversation.unreadCounts.set(memberId, isSender ? 0 : prevCount + 1);
    });

    conversation.seenBy = [senderId];
};

export const emitNewMessage = (io, conversation, message, signedUrl = null) => {
    const payloadMessage = typeof message.toObject === 'function' ? message.toObject() : { ...message };
    if (payloadMessage.metadata instanceof Map) {
        payloadMessage.metadata = Object.fromEntries(payloadMessage.metadata);
    }
    payloadMessage.signedUrl = signedUrl ?? null;

    const lastMsgRaw = conversation.lastMessage?.toObject?.() || conversation.lastMessage;
    const lastMsgPayload = { ...lastMsgRaw };
    if (lastMsgPayload?.metadata instanceof Map) {
        lastMsgPayload.metadata = Object.fromEntries(lastMsgPayload.metadata);
    }

    io.to(conversation._id.toString()).emit('new-message', {
        message: payloadMessage,
        conversation: {
            _id: conversation._id,
            lastMessage: lastMsgPayload,
            lastMessageAt: conversation.lastMessageAt,
            seenBy: conversation.seenBy,
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
    const resource_type = type === 'image' ? 'image' : 'raw';

    return cloudinary.url(filePublicId, {
        resource_type,
        type: 'authenticated',
        sign_url: true,
        secure: true,
        expires_at: Math.floor(Date.now() / 1000) + 3600, // 1h
    });
}