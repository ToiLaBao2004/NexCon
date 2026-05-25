import crypto from 'node:crypto';

const PROXY_SECRET_HEADER = 'x-nexcon-proxy-secret';
const HEALTHCHECK_PATH = '/auth/health';

function getHeaderValue(req) {
    const value = req.headers[PROXY_SECRET_HEADER];
    if (Array.isArray(value)) return value[0] || '';
    return value || '';
}

function safeEqual(left, right) {
    const leftBuffer = Buffer.from(String(left));
    const rightBuffer = Buffer.from(String(right));

    if (leftBuffer.length !== rightBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function requireProxySecret(req, res, next) {
    const expectedSecret = process.env.BACKEND_PROXY_SECRET;

    if (!expectedSecret || req.path === HEALTHCHECK_PATH) {
        return next();
    }

    const providedSecret = getHeaderValue(req);
    if (!providedSecret || !safeEqual(providedSecret, expectedSecret)) {
        return res.status(403).json({ message: 'Forbidden.' });
    }

    return next();
}

