import AuditLog from '../models/auditLogModel.js';

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
        AuditLog.create({
            userId: req.user._id,
            role: req.user.role || 'user',
            method: req.method,
            path: req.originalUrl || req.url,
            statusCode: res.statusCode,
            durationMs: Date.now() - startedAt,
            ip: getClientIp(req),
            userAgent: req.headers['user-agent'] || '',
            query: sanitizeQuery(req.query),
        }).catch((error) => {
            console.error('[AuditLog] Could not write audit log:', error.message);
        });
    });

    return next();
}
