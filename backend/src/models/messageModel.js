import mongoose from 'mongoose';
import { normalizeVietnamese } from '../utils/vietnameseHelper.js';

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
    searchContent: {
        type: String,
        trim: true,
        select: false,
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
    replyTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
        default: null,
    },
    reactions: [
        {
            userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
            emoji: { type: String, required: true }
        }
    ],
}, { timestamps: true });

// Pre-save hook to normalize content for search
messageSchema.pre('save', function (next) {
    if (this.isModified('content')) {
        this.searchContent = normalizeVietnamese(this.content || '');
    }
    next();
});

// Compound index to optimize queries fetching messages by conversation and sorting by creation time
messageSchema.index({ conversationId: 1, createdAt: -1 });
// Compound index to optimize searching within a conversation
messageSchema.index({ conversationId: 1, searchContent: 1 });

export const MESSAGE_TYPE_LIST = MESSAGE_TYPES;
const MessageModel = mongoose.models.Message || mongoose.model('Message', messageSchema);

export default MessageModel;