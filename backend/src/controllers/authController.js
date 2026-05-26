import bcrypt from 'bcrypt';
import User from '../models/userModel.js';
import Session from '../models/sessionModel.js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import Otp from '../models/otpModel.js';
import validator from 'validator';
import { removeSubscription } from '../services/pushNotificationService.js';
import { createNotification } from '../services/notificationServices.js';
import { disconnectSessionSockets, disconnectUserSockets } from '../socket/index.js';
import { checkFieldFormat } from '../utils/fieldFormat.js';
import { OAuth2Client } from 'google-auth-library';
import { saveGoogleAvatarToCloudinary } from '../config/passport.js';
import LockAppeal from '../models/lockAppealModel.js';
import { getUserModerationDetails } from '../services/moderation/violationService.js';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const ACCESS_TOKEN_TTL = '30m';
const REFRESH_TOKEN_TTL = 14 * 24 * 60 * 60 * 1000 // 14 days in milliseconds
const MAX_ACTIVE_SESSIONS_PER_USER = 20;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

function hashRefreshToken(token) {
    return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

async function findSessionByRefreshToken(token, select = '') {
    if (!token) return null;

    const tokenHash = hashRefreshToken(token);
    let query = Session.findOne({ refreshToken: tokenHash });
    if (select) query = query.select(select);
    let session = await query;
    if (session) return session;

    let legacyQuery = Session.findOne({ refreshToken: token });
    if (select) legacyQuery = legacyQuery.select(select);
    session = await legacyQuery;
    if (session) {
        await Session.updateOne(
            { _id: session._id, refreshToken: token },
            { $set: { refreshToken: tokenHash } }
        );
    }

    return session;
}

function createSessionPayload({ userId, refreshToken, expiresAt, deviceInfo }) {
    return {
        userId,
        refreshToken: hashRefreshToken(refreshToken),
        expiresAt,
        deviceInfo,
    };
}

function collectSessionFcmTokens(sessions) {
    const list = Array.isArray(sessions) ? sessions : [sessions];
    return Array.from(new Set(
        list
            .flatMap((session) => session?.fcmTokens || [])
            .map((token) => String(token || '').trim())
            .filter(Boolean)
    ));
}

async function removeSessionFcmTokensFromUser(userId, sessions) {
    const tokens = collectSessionFcmTokens(sessions);
    if (!userId || tokens.length === 0) return;

    await User.updateOne(
        { _id: userId },
        { $pull: { fcmTokens: { $in: tokens } } }
    );
}

async function enforceSessionLimit(userId, currentSessionId) {
    const overflowSessions = await Session.find({
        userId,
        _id: { $ne: currentSessionId },
    })
        .select('_id fcmTokens')
        .sort({ createdAt: -1 })
        .skip(MAX_ACTIVE_SESSIONS_PER_USER - 1)
        .lean();

    if (!overflowSessions.length) return;

    const overflowIds = overflowSessions.map((session) => session._id);
    await removeSessionFcmTokensFromUser(userId, overflowSessions);
    await Session.deleteMany({ _id: { $in: overflowIds } });
    overflowIds.forEach((sessionId) => disconnectSessionSockets(sessionId, 'session-limit'));
}

function parseIp(req) {
    const raw = req.headers['x-forwarded-for'] || req.ip || req.socket?.remoteAddress || '';
    if (raw === '::1' || raw.startsWith('::ffff:127.')) return 'localhost';
    return raw.replace(/^::ffff:/, '');
}

function parseDeviceName(userAgent = '') {
    if (!userAgent) return 'Unknown Device';

    let browser = 'Unknown Browser';
    if (userAgent.includes('Chrome')) browser = 'Chrome';
    else if (userAgent.includes('Firefox')) browser = 'Firefox';
    else if (userAgent.includes('Safari')) browser = 'Safari';
    else if (userAgent.includes('Edge')) browser = 'Edge';

    let os = 'Unknown OS';
    if (userAgent.includes('Windows')) os = 'Windows';
    else if (userAgent.includes('Mac')) os = 'MacOS';
    else if (userAgent.includes('Linux')) os = 'Linux';
    else if (userAgent.includes('Android')) os = 'Android';
    else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) os = 'iOS';

    return `${browser} on ${os}`;
}

function buildSafeUser(user) {
    return {
        _id: user._id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        phone: user.phone,
        profileVisibility: user.profileVisibility || 'public',
        googleId: user.googleId,
        music: user.music,
        role: user.role || 'user',
        lock: user.lock,
        moderation: user.moderation,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
    };
}

function ensureAccountUnlocked(user) {
    if (user?.lock?.isLocked) {
        const error = new Error(user.lock.reason || 'Tài khoản của bạn đang bị khóa.');
        error.statusCode = 423;
        throw error;
    }
}

function handleAuthError(res, error, fallbackMessage = 'Internal server error.') {
    if (error?.statusCode === 423) {
        return res.status(423).json({
            locked: true,
            message: error.message || 'Tài khoản của bạn đang bị khóa.',
        });
    }

    return res.status(500).json({ message: fallbackMessage });
}

async function sendLockedAccountResponse(res, user) {
    const moderation = await getUserModerationDetails(user._id, { limit: 10 });
    return res.status(423).json({
        locked: true,
        title: 'Tài khoản đang bị hạn chế',
        message: moderation.restriction.reason || user.lock?.reason || 'Tài khoản của bạn đang bị khóa.',
        restriction: moderation.restriction,
        violationSummary: moderation.summary,
        violationHistory: moderation.history,
        appeal: moderation.appeal,
    });
}

function validateSignupCredentials({ email, password, confirmPassword }) {
    if (!email || !password || (confirmPassword !== undefined && !confirmPassword)) {
        return 'All fields are required.';
    }
    if (!validator.isEmail(email)) {
        return 'Invalid email format.';
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
        return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`;
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
        return `Password cannot exceed ${MAX_PASSWORD_LENGTH} characters.`;
    }
    if (confirmPassword !== undefined && password !== confirmPassword) {
        return 'Passwords do not match.';
    }
    return null;
}

export async function verifyValidFieldsSignUp(req, res) {
    try {
        let { email, password, confirmNewPassword } = req.body;
        email = String(email || '').trim().toLowerCase();
        const credentialError = validateSignupCredentials({
            email,
            password: String(password || ''),
            confirmPassword: String(confirmNewPassword || ''),
        });
        if (credentialError) {
            return res.status(400).json({ message: credentialError });
        }
        const existingEmail = await User.findOne({ email: email })
        if (existingEmail) {
            return res.status(409).json({ message: 'Email already in use.' });
        }
        return res.status(200).json({ success: true, message: 'All fields are valid.' });
    } catch (error) {
        console.error('Error during field verification:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

export async function signUp(req, res) {
    try {
        let { email, password, firstname, lastname, otp } = req.body;
        email = String(email || '').trim().toLowerCase();
        password = String(password || '');
        const normalizedFirstname = String(firstname || '').trim();
        const normalizedLastname = String(lastname || '').trim();
        const normalizedOtp = String(otp || '').trim();
        if (!email || !password || !normalizedFirstname || !normalizedLastname || !normalizedOtp) {
            return res.status(400).json({ message: 'All fields are required.' });
        }
        const credentialError = validateSignupCredentials({ email, password });
        if (credentialError) {
            return res.status(400).json({ message: credentialError });
        }
        const displayName = `${normalizedFirstname} ${normalizedLastname}`.trim();
        const displayNameError = checkFieldFormat('displayName', displayName);
        if (displayNameError) {
            return res.status(400).json({ message: displayNameError });
        }
        const existingEmail = await User.findOne({ email });
        if (existingEmail) {
            return res.status(409).json({ message: 'Email already in use.' });
        }
        const otpRecord = await Otp.findOne({ email: email, type: 'verification' }).sort({ createdAt: -1 });
        if (!otpRecord || otpRecord.otp !== normalizedOtp || otpRecord.expiresAt < Date.now()) {
            return res.status(400).json({ message: 'Invalid or expired OTP.' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({
            email: email,
            password: hashedPassword,
            displayName
        });
        await newUser.save();
        return res.status(201).json({ message: 'User registered successfully.' });
    } catch (error) {
        console.error('Error during sign-up:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

export async function signIn(req, res) {
    try {
        let { email, password } = req.body;
        email = email?.trim();
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required.' });
        }
        const user = await User.findOne({ email: email });
        if (!user) {
            return res.status(401).json({ message: 'Invalid email or password.' });
        }
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid email or password.' });
        }
        if (user.lock?.isLocked) {
            return sendLockedAccountResponse(res, user);
        }
        ensureAccountUnlocked(user);

        const userAgent = req.headers['user-agent'] || '';
        const ip = parseIp(req);
        const deviceName = parseDeviceName(userAgent);

        const refreshToken = crypto.randomBytes(64).toString('hex');

        const session = await Session.create(createSessionPayload({
            userId: user._id,
            refreshToken,
            expiresAt: Date.now() + REFRESH_TOKEN_TTL,
            deviceInfo: {
                userAgent,
                ip,
                deviceName
            }
        }));

        const accessToken = jwt.sign({ userId: user._id, sessionId: session._id }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: ACCESS_TOKEN_TTL });

        res.cookie('refreshToken', refreshToken, {
            httpOnly: true, // cannot be accessed via JavaScript
            secure: true, // set to true if using HTTPS
            sameSite: 'none', // backend and frontend are on different domains (if same domain, use 'lax' or 'strict')
            maxAge: REFRESH_TOKEN_TTL
        });

        const existingSessionCount = await Session.countDocuments({
            userId: user._id,
            _id: { $ne: session._id }
        });

        if (existingSessionCount > 0) {
            await createNotification(
                user._id,
                'new-device-login',  // title dùng để localize bên client
                `Thiết bị ${deviceName} (IP: ${ip}) vừa đăng nhập vào tài khoản của bạn. Nếu không phải bạn, hãy đăng xuất ngay.`,
                `${process.env.FRONTEND_URL}/settings/sessions`,
                {
                    type: 'security',
                    metadata: { deviceName, ip, sessionId: session._id }
                }
            );
        }

        await enforceSessionLimit(user._id, session._id);

        const isMobile = req.headers['x-client-type'] === 'mobile';

        return res.status(200).json({
            message: `User ${user.displayName} logged in successfully.`,
            accessToken,
            user: buildSafeUser(user),
            ...(isMobile && { refreshToken })
        });
    } catch (error) {
        console.error('Error during login:', error);
        return handleAuthError(res, error);
    }
}

export async function signOut(req, res) {
    try {
        const pushEndpoint = req.body?.pushEndpoint;
        if (pushEndpoint) {
            await removeSubscription(pushEndpoint);
        }

        const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
        const requestedSession = refreshToken
            ? await findSessionByRefreshToken(refreshToken, '_id userId fcmTokens')
            : null;
        if (requestedSession && requestedSession.userId?.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Cannot sign out another user session.' });
        }
        const session = requestedSession || req.session;
        if (session) {
            await removeSessionFcmTokensFromUser(session.userId || req.user._id, session);
            await Session.deleteOne({ _id: session._id });
        }
        if (session) {
            disconnectSessionSockets(session._id, 'signed-out');
        }
        res.clearCookie('refreshToken', {
            httpOnly: true,
            secure: true,
            sameSite: 'none'
        });
        return res.status(200).json({ message: 'User logged out successfully.' });
    } catch (error) {
        console.error('Error during logout:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

export async function signOutAll(req, res) {
    try {
        const userId = req.user._id;
        await Session.deleteMany({ userId });
        await User.updateOne({ _id: userId }, { $unset: { fcmTokens: 1 } });
        disconnectUserSockets(userId, 'signed-out-all');
        res.clearCookie('refreshToken', { httpOnly: true, secure: true, sameSite: 'none' });
        return res.status(200).json({ message: 'Logged out from all devices successfully.' });
    } catch (error) {
        console.error('Error during sign out all:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

export async function getSessions(req, res) {
    try {
        const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
        if (!refreshToken) {
            return res.status(401).json({ message: 'Unauthorized.' });
        }
        const currentSession = await findSessionByRefreshToken(refreshToken);
        if (!currentSession) {
            return res.status(401).json({ message: 'Invalid session.' });
        }
        const sessions = await Session.find({ userId: currentSession.userId })
            .select('_id deviceInfo createdAt expiresAt')
            .sort({ createdAt: -1 });

        const result = sessions.map(s => ({
            sessionId: s._id,
            deviceName: s.deviceInfo?.deviceName || 'Unknown Device',
            ip: s.deviceInfo?.ip || 'Unknown',
            loginAt: s.createdAt,
            expiresAt: s.expiresAt,
            isCurrent: s._id.equals(currentSession._id)
        }));

        return res.status(200).json({ sessions: result });
    } catch (error) {
        console.error('Error fetching sessions:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

export async function signOutBySession(req, res) {
    try {
        const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
        const { sessionId } = req.params;

        const currentSession = req.session || await findSessionByRefreshToken(refreshToken);
        if (!currentSession || currentSession.userId.toString() !== req.user._id.toString()) {
            return res.status(401).json({ message: 'Invalid session.' });
        }

        const targetSession = await Session.findOne({
            _id: sessionId,
            userId: currentSession.userId
        });
        if (!targetSession) {
            return res.status(404).json({ message: 'Session not found.' });
        }

        await removeSessionFcmTokensFromUser(currentSession.userId, targetSession);
        await Session.deleteOne({ _id: sessionId });
        disconnectSessionSockets(sessionId, 'session-removed');

        const isDeletingCurrent = targetSession._id.equals(currentSession._id);
        if (isDeletingCurrent) {
            res.clearCookie('refreshToken', { httpOnly: true, secure: true, sameSite: 'none' });
        }

        return res.status(200).json({
            message: isDeletingCurrent
                ? 'Logged out from this device.'
                : `Logged out session ${sessionId} successfully.`
        });
    } catch (error) {
        console.error('Error during sign out by session:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

export async function resetNewPassword(req, res) {
    try {
        const { resetToken, newPassword, confirmNewPassword } = req.body;
        let payload;
        try {
            payload = jwt.verify(resetToken, process.env.ACCESS_TOKEN_SECRET);
        } catch {
            return res.status(401).json({ message: 'Invalid or expired reset token.' });
        }
        if (payload.purpose !== 'reset_password') {
            return res.status(401).json({ message: 'Invalid token purpose.' });
        }
        if (!newPassword || !confirmNewPassword) {
            return res.status(400).json({ message: 'All fields are required.' });
        }
        if (newPassword.length < 8) {
            return res.status(400).json({ message: 'Password must be at least 8 characters long.' });
        }
        if (newPassword !== confirmNewPassword) {
            return res.status(400).json({ message: 'Passwords do not match.' });
        }
        const user = await User.findOne({ email: payload.email }).select('_id');
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await User.updateOne({ _id: user._id }, { password: hashedPassword });
        const currentRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
        const currentSession = currentRefreshToken
            ? await findSessionByRefreshToken(currentRefreshToken, '_id')
            : null;

        if (currentSession) {
            await Session.deleteMany({
                userId: user._id,
                _id: { $ne: currentSession._id }
            });
        } else {
            await Session.deleteMany({ userId: user._id });
            disconnectUserSockets(user._id, 'password-reset');
        }
        return res.status(200).json({ message: 'Password updated successfully.' });
    } catch (error) {
        console.error('Error during password reset:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

export async function googleAuthCallback(req, res) {
    try {
        const user = req.user;
        ensureAccountUnlocked(user);
        const refreshToken = crypto.randomBytes(64).toString('hex');
        const userAgent = req.headers['user-agent'] || '';
        const ip = parseIp(req);
        const deviceName = parseDeviceName(userAgent);
        const session = await Session.create(createSessionPayload({
            userId: user._id,
            refreshToken,
            expiresAt: Date.now() + REFRESH_TOKEN_TTL,
            deviceInfo: {
                userAgent,
                ip,
                deviceName
            }
        }));

        const existingSessionCount = await Session.countDocuments({
            userId: user._id,
            _id: { $ne: session._id }
        });

        if (existingSessionCount > 0) {
            await createNotification(
                user._id,
                'new-device-login',  // title dùng để localize bên client
                `Thiết bị ${deviceName} (IP: ${ip}) vừa đăng nhập vào tài khoản của bạn. Nếu không phải bạn, hãy đăng xuất ngay.`,
                `${process.env.FRONTEND_URL}/settings/sessions`,
                {
                    type: 'security',
                    metadata: { deviceName, ip, sessionId: session._id }
                }
            );
        }

        await enforceSessionLimit(user._id, session._id);

        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            maxAge: REFRESH_TOKEN_TTL
        });
        res.redirect(
            `${process.env.FRONTEND_URL}/oauth-success`
        );
    } catch (error) {
        console.error('Error during Google OAuth callback:', error);
        if (error?.statusCode === 423) {
            return res.redirect(`${process.env.FRONTEND_URL}/signin?locked=1`);
        }
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

export async function googleSuccess(req, res) {
    try {
        const refreshToken = req.cookies?.refreshToken;
        if (!refreshToken) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const session = await findSessionByRefreshToken(refreshToken);
        if (!session || session.expiresAt < Date.now()) {
            return res.status(401).json({ message: 'Session expired' });
        }
        const user = await User.findById(session.userId).select('lock');
        if (user?.lock?.isLocked) {
            return sendLockedAccountResponse(res, user);
        }
        ensureAccountUnlocked(user);

        const accessToken = jwt.sign(
            { userId: session.userId, sessionId: session._id },
            process.env.ACCESS_TOKEN_SECRET,
            { expiresIn: ACCESS_TOKEN_TTL }
        );

        res.json({ accessToken });
    } catch (err) {
        if (err?.statusCode === 423) {
            return res.status(423).json({ locked: true, message: err.message });
        }
        res.status(500).json({ message: 'OAuth failed' });
    }
}

export async function refreshToken(req, res) {
    try {
        // Mobile gửi trong body, Web gửi qua cookie
        const token = req.cookies?.refreshToken || req.body?.refreshToken;

        if (!token) {
            return res.status(400).json({ message: 'Token not found.' });
        }
        const session = await findSessionByRefreshToken(token);
        if (!session || session.expiresAt < Date.now()) {
            return res.status(401).json({ message: 'Invalid or expired refresh token.' });
        }
        const user = await User.findById(session.userId).select('lock');
        if (user?.lock?.isLocked) {
            return sendLockedAccountResponse(res, user);
        }
        ensureAccountUnlocked(user);
        const accessToken = jwt.sign(
            { userId: session.userId, sessionId: session._id },
            process.env.ACCESS_TOKEN_SECRET,
            { expiresIn: ACCESS_TOKEN_TTL }
        );
        return res.status(200).json({ accessToken });
    } catch (error) {
        console.error('Error during token refresh:', error);
        return handleAuthError(res, error);
    }
}

export async function googleMobileAuth(req, res) {
    try {
        const { idToken } = req.body;
        if (!idToken) return res.status(400).json({ message: 'idToken is required.' });

        const ticket = await googleClient.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const { sub: googleId, email, name, picture } = ticket.getPayload();

        let user = await User.findOne({ $or: [{ googleId }, { email }] });
        if (user) {
            if (user.lock?.isLocked) {
                return sendLockedAccountResponse(res, user);
            }
            ensureAccountUnlocked(user);
            user.googleId = googleId;
            if (!user.avatarUrl && picture) {
                const uploaded = await saveGoogleAvatarToCloudinary(picture);
                user.avatarUrl = uploaded.avatarUrl;
                user.avatarId = uploaded.avatarId;
            }
            await user.save();
        } else {
            let avatarUrl = '';
            let avatarId = '';
            if (picture) {
                const uploaded = await saveGoogleAvatarToCloudinary(picture);
                avatarUrl = uploaded.avatarUrl;
                avatarId = uploaded.avatarId;
            }
            user = await User.create({
                email,
                password: crypto.randomBytes(16).toString('hex'),
                displayName: name || email.split('@')[0],
                googleId,
                avatarUrl,
                avatarId,
            });
        }

        const refreshTokenValue = crypto.randomBytes(64).toString('hex');
        const userAgent = req.headers['user-agent'] || '';
        const ip = parseIp(req);
        const deviceName = parseDeviceName(userAgent);

        const session = await Session.create(createSessionPayload({
            userId: user._id,
            refreshToken: refreshTokenValue,
            expiresAt: Date.now() + REFRESH_TOKEN_TTL,
            deviceInfo: { userAgent, ip, deviceName }
        }));

        await enforceSessionLimit(user._id, session._id);

        const accessToken = jwt.sign(
            { userId: user._id, sessionId: session._id },
            process.env.ACCESS_TOKEN_SECRET,
            { expiresIn: ACCESS_TOKEN_TTL }
        );

        return res.status(200).json({ accessToken, refreshToken: refreshTokenValue, user: buildSafeUser(user) });
    } catch (error) {
        console.error('Google mobile auth error:', error);
        if (error?.statusCode === 423) {
            return res.status(423).json({ locked: true, message: error.message });
        }
        return res.status(401).json({ message: 'Invalid Google token.' });
    }
}

export async function submitLockedAppeal(req, res) {
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        const reason = String(req.body?.reason || '').trim();

        if (!validator.isEmail(email)) {
            return res.status(400).json({ message: 'Email không hợp lệ.' });
        }

        if (reason.length < 20) {
            return res.status(400).json({ message: 'Vui lòng mô tả lý do kháng cáo ít nhất 20 ký tự.' });
        }

        if (reason.length > 2000) {
            return res.status(400).json({ message: 'Nội dung kháng cáo không được vượt quá 2000 ký tự.' });
        }

        const user = await User.findOne({ email }).select('_id email lock');
        if (!user || !user.lock?.isLocked) {
            return res.status(400).json({ message: 'Tài khoản này không ở trạng thái bị khóa.' });
        }

        const existing = await LockAppeal.findOne({
            userId: user._id,
            status: 'pending',
        }).sort({ createdAt: -1 });

        if (existing) {
            return res.status(409).json({
                code: 'PENDING_APPEAL_EXISTS',
                message: 'Bạn đã có một kháng cáo đang chờ xem xét. Vui lòng chờ kết quả trước khi gửi kháng cáo mới.',
            });
        }

        await LockAppeal.create({
            userId: user._id,
            email,
            reason,
        });

        return res.status(201).json({ message: 'Đã gửi kháng cáo. Vui lòng chờ admin xem xét.' });
    } catch (error) {
        console.error('Error submitting locked appeal:', error);
        return res.status(500).json({ message: 'Không thể gửi kháng cáo. Vui lòng thử lại.' });
    }
}
