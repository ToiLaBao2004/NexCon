import mongoose from 'mongoose';

const moderationViolationSchema = new mongoose.Schema({
    recordedAt: { type: Date, default: Date.now },
    source: { type: String, trim: true, maxlength: 120, default: 'unknown' },
    reason: { type: String, trim: true, maxlength: 1000, default: '' },
    category: { type: String, trim: true, maxlength: 80, default: '' },
    confidence: { type: Number, default: null },
    status: {
        type: String,
        enum: ['recorded', 'warning_sent', 'account_locked', 'cleared'],
        default: 'recorded',
    },
    action: { type: String, trim: true, maxlength: 120, default: 'warning' },
    countAfter: { type: Number, default: 0 },
    threshold: { type: Number, default: 0 },
    messageType: { type: String, trim: true, maxlength: 40, default: '' },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', default: null },
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'Report', default: null },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
}, { _id: true });

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
    profileVisibility: {
        type: String,
        enum: ['public', 'friends', 'private'],
        default: 'public',
    },
    googleId: {
        type: String,
        unique: true,
        sparse: true // allows multiple null values
    },
    music: {
        trackId: {
            type: String,
            trim: true,
            maxlength: 22,
        }
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
        expiresAt: { type: Date, default: null },
        lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        reason: { type: String, trim: true, maxlength: 1000, default: '' },
        unlockedAt: { type: Date, default: null },
        unlockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    moderation: {
        violationCountCache: { type: Number, default: 0 },
        lastViolationAt: { type: Date, default: null },
        nextViolationDecayAt: { type: Date, default: null },
        violationHistory: { type: [moderationViolationSchema], default: [] },
    },
    fcmTokens: [{
        type: String,
        trim: true,
        maxlength: 4096,
    }],
}, { timestamps: true });

const UserModel = mongoose.models.User || mongoose.model('User', userSchema);

export default UserModel;
