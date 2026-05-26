import AuditLog from '../models/auditLogModel.js';
import { recordApiRequest } from '../services/systemMetricsService.js';

const AUDIT_LOG_ENABLED = process.env.AUDIT_LOG_ENABLED !== 'false';
const AUDIT_LOG_FLUSH_MS = Number(process.env.AUDIT_LOG_FLUSH_MS || 1000);
const AUDIT_LOG_MAX_BATCH_SIZE = Number(process.env.AUDIT_LOG_MAX_BATCH_SIZE || 500);
const AUDIT_LOG_MAX_QUEUE_SIZE = Number(process.env.AUDIT_LOG_MAX_QUEUE_SIZE || 5000);

let auditLogQueue = [];
let auditFlushTimer = null;

function flushAuditLogs() {
    if (auditLogQueue.length === 0) return;

    const batch = auditLogQueue.splice(0, AUDIT_LOG_MAX_BATCH_SIZE);
    AuditLog.insertMany(batch, { ordered: false }).catch((error) => {
        console.error('[AuditLog] Could not write audit log batch:', error.message);
    });

    if (auditLogQueue.length > 0) {
        scheduleAuditFlush();
    }
}

function scheduleAuditFlush() {
    if (auditFlushTimer) return;

    auditFlushTimer = setTimeout(() => {
        auditFlushTimer = null;
        flushAuditLogs();
    }, AUDIT_LOG_FLUSH_MS);
    auditFlushTimer.unref?.();
}

function enqueueAuditLog(entry) {
    if (!AUDIT_LOG_ENABLED) return;

    if (auditLogQueue.length >= AUDIT_LOG_MAX_QUEUE_SIZE) {
        auditLogQueue.shift();
    }

    auditLogQueue.push(entry);
    if (auditLogQueue.length >= AUDIT_LOG_MAX_BATCH_SIZE) {
        if (auditFlushTimer) {
            clearTimeout(auditFlushTimer);
            auditFlushTimer = null;
        }
        flushAuditLogs();
        return;
    }

    scheduleAuditFlush();
}

function getClientIp(req) {
    const raw = req.headers['x-forwarded-for'] || req.ip || req.socket?.remoteAddress || '';
    return String(raw).split(',')[0].trim().replace(/^::ffff:/, '');
}

function sanitizeQuery(query = {}) {
    const sanitized = {};

    for (const [key, value] of Object.entries(query)) {
        if (typeof value === 'string') {
            sanitized[key] = value.slice(0, 300);
        } else if (Array.isArray(value)) {
            sanitized[key] = value.slice(0, 10).map((item) => String(item).slice(0, 100));
        } else if (value != null) {
            sanitized[key] = String(value).slice(0, 100);
        }
    }

    return sanitized;
}

export function auditLogMiddleware(req, res, next) {
    if (!req.user?._id) {
        return next();
    }

    const startedAt = Date.now();

    res.on('finish', () => {
        const durationMs = Date.now() - startedAt;
        const contentLength = Number(res.getHeader('content-length')) || 0;

        recordApiRequest({
            statusCode: res.statusCode,
            durationMs,
            bytes: contentLength,
        });

        enqueueAuditLog({
            userId: req.user._id,
            role: req.user.role || 'user',
            method: req.method,
            path: req.originalUrl || req.url,
            statusCode: res.statusCode,
            durationMs,
            ip: getClientIp(req),
            userAgent: req.headers['user-agent'] || '',
            query: sanitizeQuery(req.query),
        });
    });

    return next();
}
