import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    role: {
        type: String,
        index: true,
    },
    method: {
        type: String,
        required: true,
    },
    path: {
        type: String,
        required: true,
    },
    statusCode: {
        type: Number,
        required: true,
        index: true,
    },
    durationMs: {
        type: Number,
    },
    ip: {
        type: String,
    },
    userAgent: {
        type: String,
    },
    query: {
        type: mongoose.Schema.Types.Mixed,
    },
}, { timestamps: true });

auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 });

const AuditLogModel = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);

export default AuditLogModel;
