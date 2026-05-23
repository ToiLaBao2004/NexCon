import mongoose from 'mongoose';

export const USER_STATUS_MODES = ['auto', 'manual'];
export const USER_MANUAL_STATUSES = [
    'online',
    'away',
    'busy',
    'do_not_disturb',
    'invisible',
];

const userStatusSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true,
        index: true,
    },
    manual_status: {
        type: String,
        enum: USER_MANUAL_STATUSES,
        default: 'online',
    },
    status_mode: {
        type: String,
        enum: USER_STATUS_MODES,
        default: 'auto',
        index: true,
    },
    last_seen_at: {
        type: Date,
        default: Date.now,
        index: true,
    },
    show_activity: {
        type: Boolean,
        default: true,
        index: true,
    },
}, { timestamps: true });

userStatusSchema.index({ userId: 1, status_mode: 1 });

const UserStatusModel = mongoose.models.UserStatus || mongoose.model('UserStatus', userStatusSchema);

export default UserStatusModel;
