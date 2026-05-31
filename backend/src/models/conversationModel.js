import mongoose from 'mongoose';
import { decryptText, encryptText, isEncryptedText } from '../utils/messageCrypto.js';
import { getDirectConversationKey } from '../utils/directConversation.js';

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
        messages: { type: Date },
        meetings: { type: Date },
    },
    unreadMentionCount: {
        type: Number,
    },
    lastReadMessageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
    },
    lastReadAt: {
        type: Date,
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
    },
    allowMembersChangeAvatar: {
        type: Boolean,
    },
    allowMembersCreateSharedReminder: {
        type: Boolean,
    },
    approvalQueue: {
        type: [{
            userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
            addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
            createdAt: { type: Date, default: Date.now }
        }],
        default: undefined,
    }
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
    mentions: {
        type: [{
            userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            displayName: { type: String },
            offset: { type: Number },
            length: { type: Number },
        }],
        default: undefined,
    },
    deliveredTo: {
        type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
        default: undefined,
    },
    expiresAt: {
        type: Date,
    },
    isExpired: {
        type: Boolean,
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
    directKey: {
        type: String,
        trim: true,
    },
    initiatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
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
    },
    disappearingEnabled: {
        type: Boolean,
        default: false,
    },
    disappearingDurationSeconds: {
        type: Number,
        min: 60,
        max: 30 * 24 * 60 * 60,
    },
    disappearingEnabledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    disappearingEnabledAt: {
        type: Date,
    },
    disbanded: { type: Boolean },
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
    if (this.type === 'direct') {
        const participantIds = (this.participants || [])
            .map((participant) => participant.userId)
            .filter(Boolean);

        if (participantIds.length === 2 && (this.isNew || this.directKey)) {
            this.directKey = getDirectConversationKey(participantIds[0], participantIds[1]);
        }
    } else if (this.directKey) {
        this.directKey = undefined;
    }

    const rawLastMessageContent = this.get('lastMessage.content', null, { getters: false });
    if (rawLastMessageContent && !isEncryptedText(rawLastMessageContent)) {
        this.set('lastMessage.content', rawLastMessageContent);
    }
    next();
});

conversationSchema.index({ 'participants.userId': 1, 'lastMessage.createdAt': -1 });
conversationSchema.index({ 'participants.userId': 1, updatedAt: -1 });
conversationSchema.index({ 'participants.userId': 1, 'participants.pinnedAt': 1, updatedAt: -1 });
conversationSchema.index({ type: 1, 'participants.userId': 1, updatedAt: -1 });
conversationSchema.index({ type: 1, disbanded: 1, 'participants.userId': 1 });
conversationSchema.index(
    { directKey: 1 },
    {
        unique: true,
        partialFilterExpression: {
            type: 'direct',
            directKey: { $type: 'string' },
        },
    }
);

const ConversationModel = mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema);

export default ConversationModel;
