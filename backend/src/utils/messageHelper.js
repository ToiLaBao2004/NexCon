const resolveLastMessagePreview = (message) => {
    if (message.content?.trim()) return message.content.trim();

    switch (message.type) {
        case 'image': return 'Đã gửi một ảnh';
        case 'file':  return message.fileName ?? 'Tệp đính kèm';
        case 'link':  return 'Đã gửi một liên kết';
        default:      return '';
    }
};

export const updateConversationLastMessage = (conversation, message, senderId) => {
    conversation.set({
        lastMessage: {
            content:   resolveLastMessagePreview(message),
            type:      message.type ?? 'text',
            senderId:  senderId,
            createdAt: message.createdAt,
        },
    });

    conversation.participants.forEach((participant) => {
        const memberId  = participant.userId.toString();
        const isSender  = memberId === senderId.toString();
        const prevCount = conversation.unreadCounts?.get(memberId) || 0;
        conversation.unreadCounts.set(memberId, isSender ? 0 : prevCount + 1);
    });

    conversation.seenBy = [senderId];
};

export const emitNewMessage = (io, conversation, message) => {
    io.to(conversation._id.toString()).emit('new-message', {
        message,
        conversation: {
            _id:           conversation._id,
            lastMessage:   conversation.lastMessage,
            lastMessageAt: conversation.lastMessageAt,
        },
        unreadCounts: conversation.unreadCounts,
    });
};