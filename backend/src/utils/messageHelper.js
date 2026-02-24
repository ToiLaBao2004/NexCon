export const updateConversationLastMessage = async (conversation, message, senderId) => {
    conversation.set({
        lastMessage: {
            content: message.content,
            senderId: senderId,
            createdAt: message.createdAt
        }
    });
    conversation.participants.forEach(participant => {
        const memberId = participant.userId.toString();
        const isSender = memberId === senderId.toString();
        const prevCount = conversation.unreadCounts?.get(memberId) || 0;
        conversation.unreadCounts.set(memberId, isSender ? 0 : prevCount + 1);
    });
};

export const emitNewMessage = (io, conversation, message) => {
    io.to(conversation._id.toString()).emit("new-message", {
        message,
        conversation: {
            _id: conversation._id,
            lastMessage: conversation.lastMessage,
            lastMessageAt: conversation.lastMessageAt,

        },
        unreadCounts: conversation.unreadCounts,
    });
}