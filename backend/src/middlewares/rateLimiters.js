import rateLimit from 'express-rate-limit';

const DEFAULT_MESSAGE = 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.';

function toNumber(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function getRetryAfterSeconds(rateLimitState) {
    const resetTime = rateLimitState?.resetTime;
    if (!resetTime || !(resetTime instanceof Date)) return undefined;

    const remainingMs = resetTime.getTime() - Date.now();
    if (!Number.isFinite(remainingMs)) return undefined;

    return Math.max(1, Math.ceil(remainingMs / 1000));
}

function buildHandler(message = DEFAULT_MESSAGE) {
    return (req, res) => {
        const retryAfter = getRetryAfterSeconds(req.rateLimit);
        const payload = { message };

        if (retryAfter) {
            payload.retryAfter = retryAfter;
        }

        return res.status(429).json(payload);
    };
}

function normalizeEmail(value) {
    if (typeof value !== 'string') return '';
    return value.trim().toLowerCase();
}

function getClientIp(req) {
    return req.ip || req.socket?.remoteAddress || 'unknown';
}

function createLimiter({ windowMs, max, keyGenerator, skip, message }) {
    return rateLimit({
        windowMs,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator,
        skip,
        handler: buildHandler(message),
    });
}

function createIpLimiter({ windowMs, max, keyPrefix, message }) {
    return createLimiter({
        windowMs,
        max,
        message,
        keyGenerator: (req) => `${keyPrefix}:${getClientIp(req)}`,
    });
}

function createEmailLimiter({ windowMs, max, keyPrefix, message }) {
    return createLimiter({
        windowMs,
        max,
        message,
        skip: (req) => !normalizeEmail(req.body?.email),
        keyGenerator: (req) => {
            const email = normalizeEmail(req.body?.email);
            return `${keyPrefix}:${email || getClientIp(req)}`;
        },
    });
}

const SIGNUP_WINDOW_MS = toNumber(process.env.RATE_LIMIT_SIGNUP_WINDOW_MS, 10 * 60 * 1000);
const SIGNUP_MAX = toNumber(process.env.RATE_LIMIT_SIGNUP_MAX, 5);
const SIGNUP_IP_MAX = toNumber(process.env.RATE_LIMIT_SIGNUP_IP_MAX, SIGNUP_MAX);
const SIGNUP_EMAIL_MAX = toNumber(process.env.RATE_LIMIT_SIGNUP_EMAIL_MAX, SIGNUP_MAX);

const SIGNIN_WINDOW_MS = toNumber(process.env.RATE_LIMIT_SIGNIN_WINDOW_MS, 10 * 60 * 1000);
const SIGNIN_MAX = toNumber(process.env.RATE_LIMIT_SIGNIN_MAX, 10);
const SIGNIN_IP_MAX = toNumber(process.env.RATE_LIMIT_SIGNIN_IP_MAX, SIGNIN_MAX);
const SIGNIN_EMAIL_MAX = toNumber(process.env.RATE_LIMIT_SIGNIN_EMAIL_MAX, SIGNIN_MAX);

const OTP_WINDOW_MS = toNumber(process.env.RATE_LIMIT_OTP_WINDOW_MS, 10 * 60 * 1000);
const OTP_MAX = toNumber(process.env.RATE_LIMIT_OTP_MAX, 3);
const OTP_IP_MAX = toNumber(process.env.RATE_LIMIT_OTP_IP_MAX, OTP_MAX);
const OTP_EMAIL_MAX = toNumber(process.env.RATE_LIMIT_OTP_EMAIL_MAX, OTP_MAX);

const SIGNUP_MESSAGE = 'Bạn đăng ký quá nhanh. Vui lòng thử lại sau.';
const SIGNIN_MESSAGE = 'Bạn đăng nhập quá nhanh. Vui lòng thử lại sau.';
const OTP_MESSAGE = 'Bạn yêu cầu OTP quá nhanh. Vui lòng thử lại sau.';
const API_MESSAGE = 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.';

const API_WINDOW_MS = toNumber(process.env.RATE_LIMIT_API_WINDOW_MS, 15 * 60 * 1000);
const API_MAX = toNumber(process.env.RATE_LIMIT_API_MAX, 1200);

export const apiLimiter = createIpLimiter({
    windowMs: API_WINDOW_MS,
    max: API_MAX,
    keyPrefix: 'api:ip',
    message: API_MESSAGE,
});

export const signupIpLimiter = createIpLimiter({
    windowMs: SIGNUP_WINDOW_MS,
    max: SIGNUP_IP_MAX,
    keyPrefix: 'signup:ip',
    message: SIGNUP_MESSAGE,
});

export const signupEmailLimiter = createEmailLimiter({
    windowMs: SIGNUP_WINDOW_MS,
    max: SIGNUP_EMAIL_MAX,
    keyPrefix: 'signup:email',
    message: SIGNUP_MESSAGE,
});

export const signinIpLimiter = createIpLimiter({
    windowMs: SIGNIN_WINDOW_MS,
    max: SIGNIN_IP_MAX,
    keyPrefix: 'signin:ip',
    message: SIGNIN_MESSAGE,
});

export const signinEmailLimiter = createEmailLimiter({
    windowMs: SIGNIN_WINDOW_MS,
    max: SIGNIN_EMAIL_MAX,
    keyPrefix: 'signin:email',
    message: SIGNIN_MESSAGE,
});

export const otpCreateIpLimiter = createIpLimiter({
    windowMs: OTP_WINDOW_MS,
    max: OTP_IP_MAX,
    keyPrefix: 'otp-create:ip',
    message: OTP_MESSAGE,
});

export const otpCreateEmailLimiter = createEmailLimiter({
    windowMs: OTP_WINDOW_MS,
    max: OTP_EMAIL_MAX,
    keyPrefix: 'otp-create:email',
    message: OTP_MESSAGE,
});

export const otpResetIpLimiter = createIpLimiter({
    windowMs: OTP_WINDOW_MS,
    max: OTP_IP_MAX,
    keyPrefix: 'otp-reset:ip',
    message: OTP_MESSAGE,
});

export const otpResetEmailLimiter = createEmailLimiter({
    windowMs: OTP_WINDOW_MS,
    max: OTP_EMAIL_MAX,
    keyPrefix: 'otp-reset:email',
    message: OTP_MESSAGE,
});
