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

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const ACCESS_TOKEN_TTL = '30m';
const REFRESH_TOKEN_TTL = 14 * 24 * 60 * 60 * 1000 // 14 days in milliseconds

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

export async function verifyValidFieldsSignUp(req, res) {
    try {
        let { email, password, confirmNewPassword } = req.body;
        email = email?.trim();
        if (!email || !password || !confirmNewPassword) {
            return res.status(400).json({ message: 'All fields are required.' });
        }
        if (password !== confirmNewPassword) {
            return res.status(400).json({ message: 'Passwords do not match.' });
        }
        const existingEmail = await User.findOne({ email: email })
        if (existingEmail) {
            return res.status(409).json({ message: 'Email already in use.' });
        }
        if (!validator.isEmail(email)) {
            return res.status(400).json({ message: 'Invalid email format.' });
        }
        if (password.length < 8) {
            return res.status(400).json({ message: 'Password must be at least 8 characters long.' });
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
        email = email?.trim();
        if (!email || !password || !firstname || !lastname) {
            return res.status(400).json({ message: 'All fields are required.' });
        }
        const displayName = `${firstname} ${lastname}`.trim();
        const displayNameError = checkFieldFormat('displayName', displayName);
        if (displayNameError) {
            return res.status(400).json({ message: displayNameError });
        }
        const otpRecord = await Otp.findOne({ email: email, type: 'verification' }).sort({ createdAt: -1 });
        if (!otpRecord || otpRecord.otp !== otp || otpRecord.expiresAt < Date.now()) {
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

        const userAgent = req.headers['user-agent'] || '';
        const ip = parseIp(req);
        const deviceName = parseDeviceName(userAgent);

        const refreshToken = crypto.randomBytes(64).toString('hex');

        const session = await Session.create({
            userId: user._id,
            refreshToken: refreshToken,
            expiresAt: Date.now() + REFRESH_TOKEN_TTL,
            deviceInfo: {
                userAgent,
                ip,
                deviceName
            }
        });

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

        const isMobile = req.headers['x-client-type'] === 'mobile';

        return res.status(200).json({
            message: `User ${user.displayName} logged in successfully.`,
            accessToken,
            ...(isMobile && { refreshToken })
        });
    } catch (error) {
        console.error('Error during login:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

export async function signOut(req, res) {
    try {
        const pushEndpoint = req.body?.pushEndpoint;
        if (pushEndpoint) {
            await removeSubscription(pushEndpoint);
        }

        const refreshToken = req.cookies?.refreshToken;
        if (!refreshToken) {
            return res.status(200).json({ message: 'User logged out (session already cleared).' });
        }

        const session = await Session.findOne({ refreshToken }).select('_id');
        await Session.deleteOne({ refreshToken: refreshToken });
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
        const refreshToken = req.cookies?.refreshToken;
        if (!refreshToken) {
            return res.status(400).json({ message: 'Refresh token not found.' });
        }
        const session = await Session.findOne({ refreshToken });
        if (!session) {
            return res.status(401).json({ message: 'Invalid session.' });
        }
        await Session.deleteMany({ userId: session.userId });
        disconnectUserSockets(session.userId, 'signed-out-all');
        res.clearCookie('refreshToken', { httpOnly: true, secure: true, sameSite: 'none' });
        return res.status(200).json({ message: 'Logged out from all devices successfully.' });
    } catch (error) {
        console.error('Error during sign out all:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

export async function getSessions(req, res) {
    try {
        const refreshToken = req.cookies?.refreshToken;
        if (!refreshToken) {
            return res.status(401).json({ message: 'Unauthorized.' });
        }
        const currentSession = await Session.findOne({ refreshToken });
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
        const refreshToken = req.cookies?.refreshToken;
        const { sessionId } = req.params;

        if (!refreshToken) {
            return res.status(401).json({ message: 'Unauthorized.' });
        }
        const currentSession = await Session.findOne({ refreshToken });
        if (!currentSession) {
            return res.status(401).json({ message: 'Invalid session.' });
        }

        const targetSession = await Session.findOne({
            _id: sessionId,
            userId: currentSession.userId
        });
        if (!targetSession) {
            return res.status(404).json({ message: 'Session not found.' });
        }

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
        const currentRefreshToken = req.cookies?.refreshToken;

        if (currentRefreshToken) {
            await Session.deleteMany({
                userId: user._id,
                refreshToken: { $ne: currentRefreshToken }
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
        const refreshToken = crypto.randomBytes(64).toString('hex');
        const userAgent = req.headers['user-agent'] || '';
        const ip = parseIp(req);
        const deviceName = parseDeviceName(userAgent);
        const session = await Session.create({
            userId: user._id,
            refreshToken: refreshToken,
            expiresAt: Date.now() + REFRESH_TOKEN_TTL,
            deviceInfo: {
                userAgent,
                ip,
                deviceName
            }
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
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

export async function googleSuccess(req, res) {
    try {
        const refreshToken = req.cookies?.refreshToken;
        if (!refreshToken) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const session = await Session.findOne({ refreshToken });
        if (!session || session.expiresAt < Date.now()) {
            return res.status(401).json({ message: 'Session expired' });
        }

        const accessToken = jwt.sign(
            { userId: session.userId, sessionId: session._id },
            process.env.ACCESS_TOKEN_SECRET,
            { expiresIn: ACCESS_TOKEN_TTL }
        );

        res.json({ accessToken });
    } catch (err) {
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
        const session = await Session.findOne({ refreshToken: token });
        if (!session || session.expiresAt < Date.now()) {
            return res.status(401).json({ message: 'Invalid or expired refresh token.' });
        }
        const accessToken = jwt.sign(
            { userId: session.userId, sessionId: session._id },
            process.env.ACCESS_TOKEN_SECRET,
            { expiresIn: ACCESS_TOKEN_TTL }
        );
        return res.status(200).json({ accessToken });
    } catch (error) {
        console.error('Error during token refresh:', error);
        return res.status(500).json({ message: 'Internal server error.' });
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

        const session = await Session.create({
            userId: user._id,
            refreshToken: refreshTokenValue,
            expiresAt: Date.now() + REFRESH_TOKEN_TTL,
            deviceInfo: { userAgent, ip, deviceName }
        });

        const accessToken = jwt.sign(
            { userId: user._id, sessionId: session._id },
            process.env.ACCESS_TOKEN_SECRET,
            { expiresIn: ACCESS_TOKEN_TTL }
        );

        return res.status(200).json({ accessToken, refreshToken: refreshTokenValue });
    } catch (error) {
        console.error('Google mobile auth error:', error);
        return res.status(401).json({ message: 'Invalid Google token.' });
    }
}