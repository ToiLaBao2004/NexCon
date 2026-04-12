import 'dotenv/config';
import { MailerSend, EmailParams, Sender, Recipient } from "mailersend";

const mailerSend = new MailerSend({
    apiKey: process.env.MAILERSEND_API_KEY,
});

const defaultSender = new Sender(
    "noreply@test-vz9dlemw9xn4kj50.mlsender.net",
    "NexCon App"
);

export async function sendMail(to, subject, text = "", html = "") {
    try {
        const recipients = [new Recipient(to)];

        const emailParams = new EmailParams()
            .setFrom(defaultSender)
            .setTo(recipients)
            .setSubject(subject)
            .setText(text)
            .setHtml(html || text);   // ưu tiên HTML nếu có

        const response = await mailerSend.email.send(emailParams);

        console.log("📧 Email sent successfully! ID:", response);
        return true;
    } catch (error) {
        console.error("❌ MailerSend Error:", error?.body || error);
        return false;
    }
}

export async function sendOtp(to, otp) {
    const subject = "🔐 Mã OTP của bạn - NexCon App";
    const text = `Mã OTP là: ${otp}. Mã này hết hạn sau 5 phút.`;

    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; background:#f9f9f9;">
            <h2 style="color: #4CAF50;">🔐 Mã OTP của bạn</h2>
            <p>Xin chào,</p>
            <p>Mã OTP để xác thực là:</p>
            <h1 style="color: #4CAF50; letter-spacing: 6px; font-size: 36px;">${otp}</h1>
            <p style="color: #666;">Mã này sẽ hết hạn sau <strong>5 phút</strong>.</p>
            <p style="color: #999; font-size: 13px;">Nếu không phải bạn yêu cầu, vui lòng bỏ qua email này.</p>
        </div>
    `;

    return await sendMail(to, subject, text, html);
}

export async function sendReminderEmail({ to, reminder }) {
    const content = [reminder?.content, reminder?.title, reminder?.note]
        .find((item) => typeof item === 'string' && item.trim())?.trim()
        || 'Nhắc nhở mới từ NexCon';

    const formattedTime = new Date(reminder.remindAt).toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'Asia/Ho_Chi_Minh',
    });

    const subject = `🔔 Nhắc nhở: ${content.slice(0, 100)}...`;

    const html = `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 20px; background: #f9f9f9;">
            <h2 style="color: #0068ff;">🔔 Nhắc nhở của bạn</h2>
            <p style="color: #444; white-space: pre-wrap; font-size: 16px;">${content}</p>
            <p style="color: #888; font-size: 14px; margin-top: 20px;">
                <strong>Thời gian:</strong> ${formattedTime}
            </p>
            <hr style="margin: 25px 0;">
            <p style="color: #999; font-size: 12px;">Email này được gửi từ NexCon App.</p>
        </div>
    `;

    return await sendMail(to, subject, "", html);
}