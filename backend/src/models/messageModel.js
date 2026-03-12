import mongoose from 'mongoose';

const MESSAGE_TYPES = ['text', 'image', 'file', 'link'];

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
    type: {
        type: String,
        enum: MESSAGE_TYPES,
        default: 'text',
        required: true
    },
    content: {
        type: String,
        trim: true,
    },
    fileUrl: {
        type: String,
    },
    filePublicId: {
        type: String,
    },
    fileName: {
        type: String,
    },
    fileSize: {
        type: Number,
    },
    mimeType: {
        type: String,
    },
    isPinned: {
        type: Boolean,
        default: false,
    },
    pinnedAt: {
        type: Date
    },
    isRecalled: {
        type: Boolean,
        default: false,
    },
}, { timestamps: true });

// Compound index to optimize queries fetching messages by conversation and sorting by creation time
messageSchema.index({ conversationId: 1, createdAt: -1 });

export const MESSAGE_TYPE_LIST = MESSAGE_TYPES;
const MessageModel = mongoose.models.Message || mongoose.model('Message', messageSchema);

export default MessageModel;