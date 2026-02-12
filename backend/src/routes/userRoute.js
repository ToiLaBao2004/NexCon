import express from 'express';
import { getCurrentUser, blockUser } from '../controllers/userController.js';

const userRouter = express.Router();

userRouter.get('/me', getCurrentUser);
userRouter.post('/block/:toUserId', blockUser);

export default userRouter;