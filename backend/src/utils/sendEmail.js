import dotenv from "dotenv";
dotenv.config();

const BREVO_API_URL = process.env.BREVO_API_URL;
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const EMAIL_FROM_EMAIL = process.env.EMAIL_FROM_EMAIL;
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || "NexCon App";

function ensureMailEnv() {
    if (!BREVO_API_URL || !BREVO_API_KEY || !EMAIL_FROM_EMAIL) {
        throw new Error("Missing Brevo mail environment variables.");
    }
}

export async function sendMail(to, subject, text = "", html = "") {
    try {
        ensureMailEnv();

        const response = await fetch(BREVO_API_URL, {
            method: "POST",
            headers: {
                accept: "application/json",
                "api-key": BREVO_API_KEY,
                "content-type": "application/json",
            },
            body: JSON.stringify({
                sender: {
                    name: EMAIL_FROM_NAME,
                    email: EMAIL_FROM_EMAIL,
                },
                to: [{ email: to }],
                subject,
                textContent: text || undefined,
                htmlContent: html || undefined,
            }),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            console.error("❌ Brevo API error:", response.status, data);
            return false;
        }

        console.log("📧 Email sent:", data);
        return true;
    } catch (err) {
        console.error("❌ Error sending email:", err);
        return false;
    }
}

export async function sendOtp(to, otp) {
    const subject = "Your OTP Code";
    const text = `Your OTP code is: ${otp}. It expires in 5 minutes.`;
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
            <h2>🔐 Your OTP Code</h2>
            <p>Your OTP code is:</p>
            <h1 style="color: #4CAF50; letter-spacing: 2px;">${otp}</h1>
            <p>This code expires in <b>5 minutes</b>.</p>
        </div>
    `;

    return sendMail(to, subject, text, html);
}

export async function sendReminderEmail({ to, reminder }) {
    try {
        const content = [reminder?.content, reminder?.title, reminder?.note]
            .find((item) => typeof item === "string" && item.trim())
            ?.trim() || "Nhắc nhở mới";

        const formattedTime = new Date(reminder.remindAt).toLocaleString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            timeZone: "Asia/Ho_Chi_Minh",
        });

        const subject = `🔔 Nhắc nhở: ${content.slice(0, 120)}`;
        const text = `Nhắc nhở: ${content}\nThời gian: ${formattedTime}`;
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
                <h2 style="color: #0068ff;">🔔 Nhắc nhở của bạn</h2>
                <p style="color: #444; white-space: pre-wrap;">${content}</p>
                <p style="color: #888; font-size: 13px;">Thời gian: ${formattedTime}</p>
            </div>
        `;

        return await sendMail(to, subject, text, html);
    } catch (err) {
        console.error("❌ Error sending reminder email:", err);
        return false;
    }
}