import express from 'express';
import { getCurrentUser, test } from '../controllers/userController.js';

const userRouter = express.Router();

userRouter.get('/me', getCurrentUser);
userRouter.get('/test', test)

export default userRouter;