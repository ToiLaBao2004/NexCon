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
import { Server } from "socket.io";
import { SocketServer } from "./socketHandle.js";


const app = express();    
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

/* connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server is running on: http://localhost:${PORT}`);
    })
}); */

let server;

connectDB().then(() => {
  server = app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });

  const io = new Server(server, {
    pingTimeout: 60000,
    cors: {
      origin: process.env.CLIENT_URL,
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    console.log('Socket io connected Successfully!":', socket.id);
    SocketServer(socket, io);
  });
});
