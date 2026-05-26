import mongoose from 'mongoose';

const MAX_MEETING_PARTICIPANTS = 100;
const MAX_MEETING_WAITING_USERS = 100;

const participantSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    joinedAt: {
        type: Date,
        default: Date.now,
    },
}, { _id: false });

const meetingSchema = new mongoose.Schema({
    roomName: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    hostId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        index: true,
    },
    status: {
        type: String,
        enum: ['scheduled', 'active', 'ended'],
        default: 'active',
        index: true,
    },
    scheduledAt: {
        type: Date,
        index: true,
    },
    startedAt: {
        type: Date,
    },
    endedAt: {
        type: Date,
    },
    participants: {
        type: [participantSchema],
        validate: {
            validator: (items) => !Array.isArray(items) || items.length <= MAX_MEETING_PARTICIPANTS,
            message: `Meeting can have at most ${MAX_MEETING_PARTICIPANTS} participants.`,
        },
    },
    waitingRoom: {
        type: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
        ],
        validate: {
            validator: (items) => !Array.isArray(items) || items.length <= MAX_MEETING_WAITING_USERS,
            message: `Meeting waiting room can have at most ${MAX_MEETING_WAITING_USERS} users.`,
        },
    },
    requireApproval: {
        type: Boolean,
        default: true,
    },
}, { timestamps: true });

// Auto delete ended meetings after 7 days
meetingSchema.index(
    { updatedAt: 1 },
    {
        expireAfterSeconds: 604800, // 7 days
        partialFilterExpression: { status: 'ended' },
    }
);

const Meeting = mongoose.models.Meeting || mongoose.model('Meeting', meetingSchema);

export default Meeting;
