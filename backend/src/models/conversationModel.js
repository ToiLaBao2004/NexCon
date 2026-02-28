import mongoose from 'mongoose';

const participantSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    joinedAt: {
        type: Date,
        default: Date.now
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
    }
}, { _id: false });

const lastMessageSchema = new mongoose.Schema({
    content: {
        type: String,
        default: null
    },
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
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
}, { timestamps: true });

conversationSchema.index({ 'participants.userId': 1, 'lastMessage.createdAt': -1 });

const ConversationModel = mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema);

export default ConversationModel;