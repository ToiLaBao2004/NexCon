import mongoose from 'mongoose';

export const LOCK_APPEAL_STATUSES = ['pending', 'approved', 'rejected'];

const lockAppealSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true,
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        index: true,
    },
    reason: {
        type: String,
        required: true,
        trim: true,
        maxlength: 2000,
    },
    status: {
        type: String,
        enum: LOCK_APPEAL_STATUSES,
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
    expiresAt: {
        type: Date,
    },
}, { timestamps: true });

lockAppealSchema.index({ status: 1, createdAt: -1 });
lockAppealSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const LockAppealModel = mongoose.models.LockAppeal || mongoose.model('LockAppeal', lockAppealSchema);

export default LockAppealModel;
