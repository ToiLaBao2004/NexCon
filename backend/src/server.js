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
import callRouter from './routes/callRoute.js';
import livekitRouter from './routes/livekitRoute.js';
import reminderRouter from './routes/reminderRoute.js';
import { app, server } from './socket/index.js';
import { v2 as cloudinary } from 'cloudinary';
import { startReminderCron } from './utils/reminderCron.js';

const PORT = process.env.PORT;


// middlewares
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// public routes
app.use('/api/auth', authRouter);
app.use('/api/otp', otpRouter);

// private routes
app.use(authMiddleware);
app.use('/api/users', userRouter);
app.use('/api/friends', friendRouter);
app.use('/api/messages', messageRouter);
app.use('/api/conversations', conversationRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/calls', callRouter);
app.use('/api/livekit', livekitRouter);
app.use('/api/reminders', reminderRouter);

connectDB().then(() => {
    startReminderCron();
    server.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
});


