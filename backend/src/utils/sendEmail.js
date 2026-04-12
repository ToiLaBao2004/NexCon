import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

const transporter = nodemailer.createTransport({
    host: "smtp-relay.brevo.com",
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
});

transporter.verify()
    .then(() => console.log("✅ Brevo SMTP ready"))
    .catch((err) => console.error("❌ Brevo SMTP verify failed:", err));

export async function sendMail(to, subject, text = "", html = "") {
    try {
        const info = await transporter.sendMail({
            from: process.env.EMAIL_FROM || `"NexCon App" <${process.env.EMAIL_USER}>`,
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