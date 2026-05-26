import mongoose from 'mongoose';

const moderationViolationSchema = new mongoose.Schema({
    recordedAt: { type: Date, default: Date.now },
    source: { type: String, trim: true, maxlength: 120, default: 'unknown' },
    reason: { type: String, trim: true, maxlength: 1000 },
    category: { type: String, trim: true, maxlength: 80 },
    confidence: { type: Number },
    status: {
        type: String,
        enum: ['recorded', 'warning_sent', 'account_locked', 'cleared'],
        default: 'recorded',
    },
    action: { type: String, trim: true, maxlength: 120, default: 'warning' },
    countAfter: { type: Number, default: 0 },
    threshold: { type: Number, default: 0 },
    messageType: { type: String, trim: true, maxlength: 40 },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' },
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'Report' },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    metadata: { type: mongoose.Schema.Types.Mixed },
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
        index: true
    },
    lock: {
        isLocked: { type: Boolean, index: true },
        lockedAt: { type: Date },
        expiresAt: { type: Date },
        lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        reason: { type: String, trim: true, maxlength: 1000 },
        unlockedAt: { type: Date },
        unlockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    moderation: {
        violationCountCache: { type: Number },
        lastViolationAt: { type: Date },
        nextViolationDecayAt: { type: Date },
        violationHistory: { type: [moderationViolationSchema], default: undefined },
    },
    fcmTokens: {
        type: [{
            type: String,
            trim: true,
            maxlength: 4096,
        }],
        default: undefined,
    },
}, { timestamps: true });

const UserModel = mongoose.models.User || mongoose.model('User', userSchema);

export default UserModel;
