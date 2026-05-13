import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true
    },
    displayName: {
        type: String,
        required: true,
        trim: true
    },
    avatarUrl: {
        type: String // link CDN to image
    },
    avatarId: {
        type: String // cloudinary public id
    },
    bio: {
        type: String,
        maxlength: 500
    },
    phone: {
        type: String,
        trim: true,
        sparse: true // allows multiple null values
    },
    googleId: {
        type: String,
        unique: true,
        sparse: true // allows multiple null values
    },
    music: {
        trackId: String
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user',
        index: true
    },
    lock: {
        isLocked: { type: Boolean, default: false, index: true },
        lockedAt: { type: Date, default: null },
        lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        reason: { type: String, trim: true, maxlength: 1000, default: '' },
        unlockedAt: { type: Date, default: null },
        unlockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    moderation: {
        violationCountCache: { type: Number, default: 0 },
        lastViolationAt: { type: Date, default: null },
    },
}, { timestamps: true });

const UserModel = mongoose.models.User || mongoose.model('User', userSchema);

export default UserModel;
