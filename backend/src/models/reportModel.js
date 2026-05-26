import mongoose from 'mongoose';

export const REPORT_TARGET_TYPES = ['message', 'user'];
export const REPORT_REASON_CATEGORIES = [
    'spam',
    'harassment',
    'hate_speech',
    'sexual_content',
    'violence',
    'scam',
    'impersonation',
    'self_harm',
    'other',
];
export const REPORT_STATUSES = ['pending', 'reviewing', 'resolved', 'dismissed'];
export const REPORT_DECISIONS = ['violation', 'no_violation'];

const messageSnapshotSchema = new mongoose.Schema({
    type: { type: String },
    content: { type: String },
    fileName: { type: String },
    mimeType: { type: String },
    mentions: {
        type: [{
            userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            displayName: { type: String },
            offset: { type: Number },
            length: { type: Number },
        }],
        default: undefined,
    },
    createdAt: { type: Date },
    senderInfo: {
        type: mongoose.Schema.Types.Mixed,
    },
}, { _id: false });

const reportSchema = new mongoose.Schema({
    reporterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    targetType: {
        type: String,
        enum: REPORT_TARGET_TYPES,
        required: true,
        index: true,
    },
    targetUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    targetMessageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
        index: true,
    },
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        index: true,
    },
    reasonCategory: {
        type: String,
        enum: REPORT_REASON_CATEGORIES,
        required: true,
    },
    description: {
        type: String,
        trim: true,
        maxlength: 1000,
    },
    status: {
        type: String,
        enum: REPORT_STATUSES,
        default: 'pending',
        index: true,
    },
    reporterSnapshot: {
        displayName: String,
        email: String,
        avatarUrl: String,
    },
    targetUserSnapshot: {
        displayName: String,
        email: String,
        avatarUrl: String,
    },
    messageSnapshot: {
        type: messageSnapshotSchema,
    },
    review: {
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        reviewedAt: { type: Date },
        note: { type: String, trim: true, maxlength: 1000 },
    },
    resolution: {
        decision: { type: String, enum: [...REPORT_DECISIONS, null] },
        actionTaken: { type: String, trim: true, maxlength: 1000 },
        targetViolationCount: { type: Number },
        targetLocked: { type: Boolean },
        reporterMessage: { type: String, trim: true, maxlength: 1000 },
        targetMessage: { type: String, trim: true, maxlength: 1000 },
        aiModeration: {
            reviewedAt: { type: Date },
            blocked: { type: Boolean },
            category: { type: String, trim: true, maxlength: 80 },
            confidence: { type: Number },
            reason: { type: String, trim: true, maxlength: 1000 },
            source: { type: String, trim: true, maxlength: 80 },
        },
    },
    expiresAt: {
        type: Date,
    },
}, { timestamps: true });

reportSchema.index({ reporterId: 1, targetType: 1, targetUserId: 1, status: 1 });
reportSchema.index({ reporterId: 1, targetType: 1, targetMessageId: 1, status: 1 });
reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const ReportModel = mongoose.models.Report || mongoose.model('Report', reportSchema);

export default ReportModel;
