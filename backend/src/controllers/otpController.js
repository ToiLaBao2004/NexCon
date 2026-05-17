import Otp from "../models/otpModel.js";
import { sendOtp } from "../utils/sendEmail.js";
import crypto from "crypto";
import User from "../models/userModel.js";
import jwt from "jsonwebtoken";

function getCooldownMessage(remainingMs) {
    const seconds = Math.ceil(remainingMs / 1000);

    if (seconds >= 60) {
        const minutes = Math.ceil(seconds / 60);
        return `Please wait ${minutes} minute(s) before requesting a new OTP.`;
    }

    return `Please wait ${seconds} seconds before requesting a new OTP.`;
}

function checkOtpCooldown(latestOtp, cooldownMs = 60000) {
    if (!latestOtp) return null;

    const elapsedMs = Date.now() - latestOtp.createdAt.getTime();

    if (elapsedMs < cooldownMs) {
        return getCooldownMessage(cooldownMs - elapsedMs);
    }

    return null;
}

export async function sendOtpMakeUser(req, res) {
    try {
        let { email } = req.body;
        email = email?.trim();
        const latestOtp = await Otp.findOne({ email: email, type: 'verification' }).sort({ createdAt: -1 });
        const cooldownMessage = checkOtpCooldown(latestOtp);
        if (cooldownMessage) {
            return res.status(429).json({ message: cooldownMessage });
        }
        // make a 6-digit OTP
        const otp = crypto.randomInt(100000, 999999).toString();
        await Otp.create({
            email,
            otp,
            type: 'verification',
            expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes
        });
        await sendOtp(email, otp);
        return res.json({ message: latestOtp ? "OTP resent to email" : "OTP sent to email." });
    } catch (err) {
        console.log("Error resending OTP:", err);
        return res.status(500).json({ message: "Internal server error." });
    }
}

export async function sendOtpResetPassword(req, res) {
    try {
        let { email } = req.body;
        email = email?.trim();
        const existingEmail = await User.findOne({ email: email });
        if (!existingEmail) {
            return res.json({ message: "If this email exists, an OTP will be sent." });
        }
        const latestOtp = await Otp.findOne({ email: email, type: 'reset_password' }).sort({ createdAt: -1 });
        const cooldownMessage = checkOtpCooldown(latestOtp);
        if (cooldownMessage) {
            return res.status(429).json({ message: cooldownMessage });
        }
        // make a 6-digit OTP
        const otp = crypto.randomInt(100000, 999999).toString();
        await Otp.create({
            email,
            otp,
            type: 'reset_password',
            expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes
        });
        await sendOtp(email, otp);
        return res.json({ message: latestOtp ? "OTP resent to email" : "OTP sent to email." });
    } catch (err) {
        console.log("Error resending OTP:", err);
        return res.status(500).json({ message: "Internal server error." });
    }
}

export async function verifyOtpResetPassword(req, res) {
    try {
        let { email, otp } = req.body;
        email = email?.trim();
        if (!email || !otp) {
            return res.status(400).json({ message: 'Email and OTP are required.' });
        }
        const otpRecord = await Otp.findOne({ email: email, type: 'reset_password' }).sort({ createdAt: -1 });
        if (!otpRecord || otpRecord.otp !== otp || otpRecord.expiresAt < Date.now()) {
            return res.status(400).json({ message: 'Invalid or expired OTP.' });
        }
        const resetToken = jwt.sign(
            { email, purpose: 'reset_password' },
            process.env.ACCESS_TOKEN_SECRET,
            { expiresIn: '10m' }
        );
        await Otp.deleteOne({ _id: otpRecord._id });
        return res.status(200).json({ resetToken })
    } catch (error) {
        console.error('Error during OTP verification for password reset:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}
