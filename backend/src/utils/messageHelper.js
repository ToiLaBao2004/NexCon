import { v2 as cloudinary } from 'cloudinary';

const resolveLastMessagePreview = (message) => {
    if (message.content?.trim()) return message.content.trim();

    switch (message.type) {
        case 'image': return 'Đã gửi một ảnh';
        case 'file': return message.fileName ?? 'Tệp đính kèm';
        case 'link': return 'Đã gửi một liên kết';
        default: return '';
    }
};

export const updateConversationLastMessage = (conversation, message, senderId) => {
    conversation.set({
        lastMessage: {
            content: resolveLastMessagePreview(message),
            type: message.type ?? 'text',
            senderId: senderId,
            createdAt: message.createdAt,
        },
    });

    conversation.participants.forEach((participant) => {
        const memberId = participant.userId.toString();
        const isSender = memberId === senderId.toString();
        const prevCount = conversation.unreadCounts?.get(memberId) || 0;
        conversation.unreadCounts.set(memberId, isSender ? 0 : prevCount + 1);
    });

    conversation.seenBy = [senderId];
};

export const emitNewMessage = (io, conversation, message, signedUrl = null) => {
    const payloadMessage = typeof message.toObject === 'function' ? message.toObject() : { ...message };
    payloadMessage.signedUrl = signedUrl ?? null;

    io.to(conversation._id.toString()).emit('new-message', {
        message: payloadMessage,
        conversation: {
            _id: conversation._id,
            lastMessage: conversation.lastMessage,
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
    const resource_type = type === 'image' ? 'image' : 'raw';

    return cloudinary.url(filePublicId, {
        resource_type,
        type: 'authenticated',
        sign_url: true,
        secure: true,
        expires_at: Math.floor(Date.now() / 1000) + 3600, // 1h
    });
}