import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        required: true
    },
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    content: {
        type: String,
        trim: true,
    },
    isPinned: {
        type: Boolean
    },
    pinnedAt: {
        type: Date
    },
    isRecalled: {
        type: Boolean
    },
    imgUrl: {
        type: String // link CDN to image
    }
}, { timestamps: true });

// Compound index to optimize queries fetching messages by conversation and sorting by creation time
messageSchema.index({ conversationId: 1, createdAt: -1 });

const MessageModel = mongoose.models.Message || mongoose.model('Message', messageSchema);

export default MessageModel;