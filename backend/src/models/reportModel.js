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

const messageSnapshotSchema = new mongoose.Schema({
    type: { type: String, default: '' },
    content: { type: String, default: '' },
    fileName: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    createdAt: { type: Date, default: null },
    senderInfo: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
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
        default: null,
        index: true,
    },
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        default: null,
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
        default: '',
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
        default: null,
    },
    review: {
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        reviewedAt: { type: Date, default: null },
        note: { type: String, trim: true, maxlength: 1000, default: '' },
    },
}, { timestamps: true });

reportSchema.index({ reporterId: 1, targetType: 1, targetUserId: 1, status: 1 });
reportSchema.index({ reporterId: 1, targetType: 1, targetMessageId: 1, status: 1 });
reportSchema.index({ status: 1, createdAt: -1 });

const ReportModel = mongoose.models.Report || mongoose.model('Report', reportSchema);

export default ReportModel;
