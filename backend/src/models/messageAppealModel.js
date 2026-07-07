import mongoose from 'mongoose';

export const MESSAGE_APPEAL_STATUSES = ['pending', 'approved', 'rejected'];

const messageAppealSchema = new mongoose.Schema({
    requesterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    messageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
        required: true,
        unique: true,
        index: true,
    },
    reason: {
        type: String,
        required: true,
        trim: true,
        minlength: 10,
        maxlength: 2000,
    },
    status: {
        type: String,
        enum: MESSAGE_APPEAL_STATUSES,
        default: 'pending',
        index: true,
    },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    reviewedAt: {
        type: Date,
    },
    adminNote: {
        type: String,
        trim: true,
        maxlength: 1000,
    },
}, { timestamps: true });

messageAppealSchema.index({ status: 1, createdAt: -1 });
messageAppealSchema.index({ requesterId: 1, createdAt: -1 });

const MessageAppealModel = mongoose.models.MessageAppeal || mongoose.model('MessageAppeal', messageAppealSchema);

export default MessageAppealModel;
