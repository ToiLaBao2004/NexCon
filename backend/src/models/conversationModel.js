import mongoose from 'mongoose';

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
        default: null
    }
}, { _id: false });

const groupSchema = new mongoose.Schema({
    name: {
        type: String,
        trim: true
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
    approvalQueue: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        createdAt: { type: Date, default: Date.now }
    }]
}, { _id: false });

const lastMessageSchema = new mongoose.Schema({
    content: {
        type: String,
        default: null
    },
    type: {
        type: String,
        default: 'text'
    },
    systemType: {
        type: String,
        default: null
    },
    metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: null
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
}, { _id: false });

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
        default: null
    },
    seenBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    unreadCounts: {
        type: Map,
        of: Number,
        default: () => new Map(),
    },
    disbanded: { type: Boolean, default: false }
}, { timestamps: true });

conversationSchema.index({ 'participants.userId': 1, 'lastMessage.createdAt': -1 });

const ConversationModel = mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema);

export default ConversationModel;