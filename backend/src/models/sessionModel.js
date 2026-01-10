import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    refreshToken: {
        type: String,
        required: true,
        unique: true
    },
    expiresAt: {
        type: Date,
        required: true
    }
}, { timestamps: true });

// Auto delete expired sessions
sessionSchema.index({ "expiresAt": 1 }, { expireAfterSeconds: 0 });

const SessionModel = mongoose.models.Session || mongoose.model('Session', sessionSchema);

export default SessionModel;