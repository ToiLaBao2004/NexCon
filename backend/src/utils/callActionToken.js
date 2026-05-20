import jwt from 'jsonwebtoken';

const CALL_ACTION_TTL = '45s';

function getSecret() {
    return process.env.ACCESS_TOKEN_SECRET || process.env.JWT_SECRET;
}

export function createCallActionToken(payload) {
    const secret = getSecret();
    if (!secret) return '';

    return jwt.sign(payload, secret, { expiresIn: CALL_ACTION_TTL });
}

export function verifyCallActionToken(token) {
    const secret = getSecret();
    if (!secret) return null;

    try {
        return jwt.verify(token, secret);
    } catch {
        return null;
    }
}

export function getCallActionUrl() {
    const baseUrl = process.env.BACKEND_URL || process.env.API_BASE_URL || process.env.SERVER_URL || '';
    if (!baseUrl.trim()) return '';
    return `${baseUrl.replace(/\/+$/, '')}/api/push/call-action`;
}
