import Otp from "../models/otpModel.js";
import { sendOtp } from "../utils/sendEmail.js";
import crypto from "crypto";
import User from "../models/userModel.js";

export async function sendOtpMakeUser(req, res) {
    try {
        const { email } = req.body;
        const latestOtp = await Otp.findOne({ email: email, type: 'verification' }).sort({ createdAt: -1 });
        if (latestOtp && (Date.now() - latestOtp.createdAt.getTime()) < 60000) { // 1 minute
            return res.status(429).json({ 
                message: `Please wait ${Math.ceil(Date.now() - latestOtp.createdAt.getTime())} before requesting a new OTP.`
            });
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
        return res.status(500).json({ message: "Internal server error."});
    }
}

export async function sendOtpResetPassword(req, res) {
    try {
        const { email } = req.body;
        const existingEmail = await User.findOne({ email:email });
        if (!existingEmail) {
            return res.status(404).json({ message: "User with this email does not exist."});
        }
        const latestOtp = await Otp.findOne({ email: email, type: 'reset_password' }).sort({ createdAt: -1 });
        if (latestOtp && (Date.now() - latestOtp.createdAt.getTime()) < 60000) { // 1 minute
            return res.status(429).json({ 
                message: `Please wait ${Math.ceil(Date.now() - latestOtp.createdAt.getTime())} before requesting a new OTP.`
            });
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
        return res.status(500).json({ message: "Internal server error."});
    }
}

export async function verifyOtpResetPassword(req, res) {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) {
            return res.status(400).json({ message: 'Email and OTP are required.' });
        }
        const otpRecord = await Otp.findOne({ email: email, type: 'reset_password' }).sort({ createdAt: -1 });
        if (!otpRecord || otpRecord.otp !== otp || otpRecord.expiresAt < Date.now()) {
            return res.status(400).json({ message: 'Invalid or expired OTP.' });
        }
        return res.status(200).json({ success: true, message: 'OTP verified successfully.' });
    } catch (error) {
        console.error('Error during OTP verification for password reset:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}