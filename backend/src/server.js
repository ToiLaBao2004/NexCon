import 'dotenv/config';
import express from 'express';
import { connectDB } from './config/db.js';
import authRouter from './routes/authRoute.js';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { authMiddleware } from './middlewares/authMiddleware.js';
import userRouter from './routes/userRoute.js';
import otpRouter from './routes/otpRoute.js';
import friendRouter from './routes/friendRoute.js';
import messageRouter from './routes/messageRoute.js';
import conversationRouter from './routes/conversationRoute.js';
import notificationRouter from './routes/notificationRoute.js';
import livekitRouter from './routes/livekitRoute.js';
import meetingRouter from './routes/meetingRoutes.js';
import reminderRouter from './routes/reminderRoute.js';
import pushRouter from './routes/pushRoute.js';
import reportRouter from './routes/reportRoute.js';
import adminRouter from './routes/adminRoute.js';
import { app, server } from './socket/index.js';
import { v2 as cloudinary } from 'cloudinary';
import { startReminderWorker, reloadPendingReminders } from './workers/reminderWorker.js';
import { apiLimiter } from './middlewares/rateLimiters.js';
import { auditLogMiddleware } from './middlewares/auditLogMiddleware.js';
import { requireUser } from './middlewares/roleMiddleware.js';

const PORT = process.env.PORT;

const trustProxy = process.env.TRUST_PROXY;
if (trustProxy) {
    const parsed = trustProxy === 'true' ? 1 : Number.parseInt(trustProxy, 10);
    if (Number.isFinite(parsed)) {
        app.set('trust proxy', parsed);
    }
}


// middlewares
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use('/api', apiLimiter);

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// public routes
app.use('/api/auth', authRouter);
app.use('/api/otp', otpRouter);
app.use('/api/push', pushRouter);

// private routes
app.use(authMiddleware);
app.use(auditLogMiddleware);
app.use('/api/admin', adminRouter);
app.use('/api/users', userRouter);
app.use('/api/friends', requireUser, friendRouter);
app.use('/api/messages', requireUser, messageRouter);
app.use('/api/conversations', requireUser, conversationRouter);
app.use('/api/notifications', requireUser, notificationRouter);
app.use('/api/livekit', requireUser, livekitRouter);
app.use('/api/meetings', requireUser, meetingRouter);
app.use('/api/reminders', requireUser, reminderRouter);
app.use('/api/reports', requireUser, reportRouter);

connectDB().then(() => {
    try {
        startReminderWorker();
        reloadPendingReminders();
    } catch (err) {
        console.error('[Server] Không thể khởi tạo Reminder Worker (Redis có thể chưa sẵn sàng):', err.message);
    }
    server.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
});


