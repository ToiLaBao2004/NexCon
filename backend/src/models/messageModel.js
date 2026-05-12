import mongoose from 'mongoose';
import { normalizeVietnamese } from '../utils/vietnameseHelper.js';

const MESSAGE_TYPES = ['text', 'image', 'audio', 'file', 'link', 'system', 'sticker'];

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
    senderInfo: {
        displayName: { type: String },
        avatarUrl: { type: String }
    },
    mentions: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        displayName: { type: String },
        offset: { type: Number },
        length: { type: Number },
    }],
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
    systemType: {
        type: String,
        enum: ['member_added', 'member_kicked', 'member_left', 'group_disbanded',
            'call_started', 'call_ended', 'chat_cleared', 'approval_mode_changed',
            'call', 'admin_transferred', 'group_avatar_updated', 'group_name_updated',
            'message_pinned', 'message_unpinned',
            'reminder_created_local', 'shared_reminder_created', 'shared_reminder_participation_changed', 'shared_reminder_cancelled', 'shared_reminder_updated'],
    },
    metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
    },
    searchContent: {
        type: String,
        trim: true,
        select: false,
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
    reportStatus: {
        type: Boolean,
        default: false,
        index: true,
    },
    reportReview: {
        reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'Report', default: null },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        reviewedAt: { type: Date, default: null },
        note: { type: String, trim: true, maxlength: 1000, default: '' },
    },
    replyTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
    },
    reactions: [
        {
            userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
            emoji: { type: String, required: true }
        }
    ],
    deliveredTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
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
