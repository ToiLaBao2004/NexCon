import mongoose from 'mongoose';
import { normalizeVietnamese } from '../utils/vietnameseHelper.js';
import { decryptText, encryptText, isEncryptedText } from '../utils/messageCrypto.js';

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
    mentions: {
        type: [{
            userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
            displayName: { type: String },
            offset: { type: Number },
            length: { type: Number },
        }],
        default: undefined,
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
        get: decryptText,
        set: encryptText,
    },
    systemType: {
        type: String,
        enum: ['member_added', 'member_kicked', 'member_left', 'group_disbanded',
            'call_started', 'call_ended', 'chat_cleared', 'approval_mode_changed',
            'group_avatar_permission_changed',
            'call', 'admin_transferred', 'group_avatar_updated', 'group_name_updated',
            'message_pinned', 'message_unpinned',
            'disappearing_messages_enabled', 'disappearing_messages_disabled',
            'reminder_created_local', 'shared_reminder_created', 'shared_reminder_participation_changed', 'shared_reminder_cancelled', 'shared_reminder_updated',
            'shared_reminder_permission_changed'],
    },
    metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
    },
    searchContent: {
        type: String,
        trim: true,
        select: false,
        get: decryptText,
        set: encryptText,
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
    },
    pinnedAt: {
        type: Date
    },
    isRecalled: {
        type: Boolean,
    },
    reportStatus: {
        type: Boolean,
        index: true,
    },
    reportReview: {
        reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'Report' },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        reviewedAt: { type: Date },
        note: { type: String, trim: true, maxlength: 1000 },
    },
    replyTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
    },
    reactions: {
        type: [{
            userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
            emoji: { type: String, required: true }
        }],
        default: undefined,
    },
    deliveredTo: {
        type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
        default: undefined,
    },
    deliveryStartedAt: {
        type: Date,
    },
    expiresAt: {
        type: Date,
        index: true,
    },
    isExpired: {
        type: Boolean,
        default: false,
    },
    expiredAt: {
        type: Date,
    },
    expiryMediaCleanupStatus: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'skipped'],
    },
}, {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
});

// Pre-save hook to normalize content for search and encrypt legacy plaintext rows on touch.
messageSchema.pre('save', function (next) {
    const rawContent = this.get('content', null, { getters: false });
    const plainContent = decryptText(rawContent || '');

    if (rawContent && !isEncryptedText(rawContent)) {
        this.content = rawContent;
    }

    if (this.type === 'sticker') {
        this.searchContent = undefined;
        next();
        return;
    }

    if (rawContent != null) {
        this.searchContent = normalizeVietnamese(plainContent || '');
    } else {
        const rawSearchContent = this.get('searchContent', null, { getters: false });
        if (rawSearchContent && !isEncryptedText(rawSearchContent)) {
            this.searchContent = rawSearchContent;
        }
    }
    next();
});

// Compound index to optimize queries fetching messages by conversation and sorting by creation time
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ conversationId: 1, type: 1, createdAt: -1 });
messageSchema.index({ conversationId: 1, isPinned: 1, pinnedAt: -1 });
// Compound index to optimize searching within a conversation
messageSchema.index({ conversationId: 1, searchContent: 1 });
// Mention inbox queries filter by mentioned user and newest messages first.
messageSchema.index({ 'mentions.userId': 1, createdAt: -1 });
messageSchema.index({ isExpired: 1, expiresAt: 1 });

export const MESSAGE_TYPE_LIST = MESSAGE_TYPES;
const MessageModel = mongoose.models.Message || mongoose.model('Message', messageSchema);

export default MessageModel;
