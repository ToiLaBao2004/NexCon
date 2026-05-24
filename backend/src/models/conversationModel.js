import mongoose from 'mongoose';
import { decryptText, encryptText, isEncryptedText } from '../utils/messageCrypto.js';

const participantSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    userInfo: {
        displayName: { type: String },
        avatarUrl: { type: String }
    },
    joinedAt: {
        type: Date,
        default: Date.now
    },
    clearedAt: {
        type: Date,
    },
    pinnedAt: {
        type: Date,
    },
    mute: {
        messages: { type: Date, default: null },
        meetings: { type: Date, default: null },
    },
    unreadMentionCount: {
        type: Number,
        default: 0,
    },
    lastReadMessageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
        default: null,
    },
    lastReadAt: {
        type: Date,
        default: null,
    }
}, { _id: false });

const groupSchema = new mongoose.Schema({
    name: {
        type: String,
        trim: true,
        maxlength: 100
    },
    avatarUrl: {
        type: String,
    },
    avatarId: {
        type: String,
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    isApprovalRequired: {
        type: Boolean,
        default: false
    },
    allowMembersChangeAvatar: {
        type: Boolean,
        default: true
    },
    allowMembersCreateSharedReminder: {
        type: Boolean,
        default: true
    },
    approvalQueue: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        createdAt: { type: Date, default: Date.now }
    }]
}, { _id: false });

const lastMessageSchema = new mongoose.Schema({
    _id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    },
    content: {
        type: String,
        get: decryptText,
        set: encryptText,
    },
    type: {
        type: String,
        default: 'text'
    },
    systemType: {
        type: String,
    },
    metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
    },
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    senderInfo: {
        displayName: { type: String },
        avatarUrl: { type: String }
    },
    createdAt: {
        type: Date
    }
}, {
    _id: false,
    toJSON: { getters: true },
    toObject: { getters: true },
});

const conversationSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['direct', 'group'],
        required: true
    },
    participants: {
        type: [participantSchema],
        required: true
    },
    group: {
        type: groupSchema
    },
    lastMessage: {
        type: lastMessageSchema,
    },
    unreadCounts: {
        type: Map,
        of: Number,
        default: () => new Map(),
    },
    disbanded: { type: Boolean, default: false },
    disbandedAt: {
        type: Date,
    },
    deleteAfter: {
        type: Date,
        index: true,
    },
    cleanup: {
        status: {
            type: String,
            enum: ['idle', 'queued', 'processing', 'completed', 'failed'],
            default: 'idle',
            index: true,
        },
        jobId: {
            type: String,
        },
        queuedAt: {
            type: Date,
        },
        scheduledFor: {
            type: Date,
        },
        retentionDays: {
            type: Number,
        },
        startedAt: {
            type: Date,
        },
        completedAt: {
            type: Date,
        },
        failedAt: {
            type: Date,
        },
        error: {
            type: String,
        },
    },
}, {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
});

conversationSchema.pre('save', function (next) {
    const rawLastMessageContent = this.get('lastMessage.content', null, { getters: false });
    if (rawLastMessageContent && !isEncryptedText(rawLastMessageContent)) {
        this.set('lastMessage.content', rawLastMessageContent);
    }
    next();
});

conversationSchema.index({ 'participants.userId': 1, 'lastMessage.createdAt': -1 });

const ConversationModel = mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema);

export default ConversationModel;
