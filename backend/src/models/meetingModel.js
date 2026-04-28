import mongoose from 'mongoose';

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
        default: null,
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
        default: null,
        index: true,
    },
    startedAt: {
        type: Date,
        default: null,
    },
    endedAt: {
        type: Date,
        default: null,
    },
    participants: [participantSchema],
    waitingRoom: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
    ],
    requireApproval: {
        type: Boolean,
        default: true,
    },
}, { timestamps: true });

const Meeting = mongoose.models.Meeting || mongoose.model('Meeting', meetingSchema);

export default Meeting;
