import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

/**
 * Send email
 *
 * @param {string} to
 * @param {string} subject
 * @param {string} text
 * @param {string} html
 * @returns {Promise<boolean>}
 */
export async function sendMail(to, subject, text = "", html = "") {
    try {
        const info = await transporter.sendMail({
            from: `"Moji App" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            text,
            html,
        });

        console.log("📧 Email sent:", info.messageId);
        return true;
    } catch (err) {
        console.error("❌ Error sending email:", err);
        return false;
    }
}

/**
 * Send OTP email
 *
 * @param {string} to
 * @param {string} otp
 */
export async function sendOtp(to, otp) {
    const subject = "Your OTP Code";
    const text = `Your OTP code is: ${otp}. It expires in 5 minutes.`;
    const html = `
        <h2>🔐 Your OTP Code</h2>
        <p>Your OTP code is:</p>
        <h1 style="color: #4CAF50">${otp}</h1>
        <p>This code expires in <b>5 minutes</b>.</p>
    `;

    return await sendMail(to, subject, text, html);
}