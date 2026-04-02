import mongoose from 'mongoose';

const callParticipantSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // Trạng thái của từng người trong cuộc gọi
    status: {
        type: String,
        enum: ['ringing', 'accepted', 'declined', 'missed', 'left', 'kicked'],
        required: true,
        default: 'ringing'
    },
    micEnabled: {
        type: Boolean,
        default: true
    },
    videoEnabled: {
        type: Boolean,
        default: false
    },
    joinedAt: {
        type: Date,
    },
    leftAt: {
        type: Date,
    }
}, { _id: false });

const callSchema = new mongoose.Schema({
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        required: true
    },
    initiatorUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: ['voice', 'video'],
        required: true
    },
    participants: {
        type: [callParticipantSchema],
        required: true
    },
    overallStatus: {
        type: String,
        enum: ['active', 'ended', 'canceled', 'missed'],
        default: 'active'
    },
    // Thời gian cuộc gọi tính bằng giây (tính từ lúc có người accepted đến lúc ended)
    duration: {
        type: Number,
        default: 0
    },
    // Thời điểm bắt đầu thực sự (có người accepted)
    startedAt: {
        type: Date,
    },
    // Thời điểm kết thúc
    endedAt: {
        type: Date,
    }
}, { timestamps: true });

// Query lịch sử cuộc gọi theo conversation
callSchema.index({ conversationId: 1, createdAt: -1 });

// Query lịch sử cuộc gọi theo user
callSchema.index({ 'participants.userId': 1, createdAt: -1 });

const CallModel = mongoose.models.Call || mongoose.model('Call', callSchema);

export default CallModel;