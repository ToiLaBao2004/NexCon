import bcrypt from 'bcrypt';
import User from '../models/userModel.js';
import Session from '../models/sessionModel.js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import Otp from '../models/otpModel.js';
import validator from 'validator';

const ACCESS_TOKEN_TTL = '30m';
const REFRESH_TOKEN_TTL = 14 * 24 * 60 * 60 * 1000 // 14 days in milliseconds

export async function verifyValidFieldsSignUp(req, res) {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: 'All fields are required.' });
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
        const { email, password, firstname, lastname, otp } = req.body;
        if (!email || !password || !firstname || !lastname) {
            return res.status(400).json({ message: 'All fields are required.' });
        }
        const otpRecord = await Otp.findOne({ email: email, type: 'verification' }).sort({ createdAt: -1 });
        if (!otpRecord || otpRecord.otp !== otp || otpRecord.expiresAt < Date.now()) {
            return res.status(400).json({ message: 'Invalid or expired OTP.' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({
            email: email,
            password: hashedPassword,
            displayName: `${firstname} ${lastname}`
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
        const { email, password } = req.body;
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
        const accessToken = jwt.sign({ userId: user._id }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
        const refreshToken = crypto.randomBytes(64).toString('hex');
        await Session.create({
            userId: user._id,
            refreshToken: refreshToken,
            expiresAt: Date.now() + REFRESH_TOKEN_TTL
        });
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true, // cannot be accessed via JavaScript
            secure: true, // set to true if using HTTPS
            samesite: 'none', // backend and frontend are on different domains (if same domain, use 'lax' or 'strict')
            maxAge: REFRESH_TOKEN_TTL
        })
        return res.status(200).json({ message: `User ${user.displayName} logged in successfully.`, accessToken: accessToken });
    } catch (error) {
        console.error('Error during login:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

export async function signOut(req, res) {
    try {
        const refreshToken = req.cookies?.refreshToken;
        if (!refreshToken) {
            return res.status(400).json({ message: 'Refresh token not found.' });
        }
        await Session.deleteOne({ refreshToken: refreshToken });
        res.clearCookie('refreshToken', {
            httpOnly: true,
            secure: true,
            samesite: 'none'
        });
        return res.status(200).json({ message: 'User logged out successfully.' });
    } catch (error) {
        console.error('Error during logout:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

export async function updateNewPassword(req, res) {
    try {
        const { email, newPassword, confirmNewPassword } = req.body;
        if (!email || !newPassword || !confirmNewPassword) {
            return res.status(400).json({ message: 'All fields are required.' });
        }
        if (newPassword.length < 8) {
            return res.status(400).json({ message: 'Password must be at least 8 characters long.' });
        }
        if (newPassword !== confirmNewPassword) {
            return res.status(400).json({ message: 'Passwords do not match.' });
        }
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await User.updateOne({ email: email }, { password: hashedPassword });
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
        await Session.create({
            userId: user._id,
            refreshToken: refreshToken,
            expiresAt: Date.now() + REFRESH_TOKEN_TTL
        });
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
            { userId: session.userId },
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
        const token = req.cookies?.refreshToken;
        if (!token) {
            return res.status(400).json({ message: 'Token not found.' });
        }
        const session = await Session.findOne({ refreshToken: token });
        if (!session || session.expiresAt < Date.now()) {
            return res.status(403).json({ message: 'Invalid or expired refresh token.' });
        }
        const accessToken = jwt.sign({ userId: session.userId }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
        return res.status(200).json({ accessToken: accessToken });
    } catch (error) {
        console.error('Error during token refresh:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}