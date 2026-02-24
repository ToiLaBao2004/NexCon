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
import { app,server } from './socket/index.js';


// const app = express();    
const PORT = process.env.PORT;


// middlewares
app.use(cors({origin: process.env.CLIENT_URL, credentials: true}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// public routes
app.use('/api/auth', authRouter);
app.use('/api/otp', otpRouter);

// private routes
app.use(authMiddleware);
app.use('/api/users', userRouter);
app.use('/api/friends', friendRouter);
app.use('/api/messages', messageRouter);
app.use('/api/conversations', conversationRouter);

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
});


