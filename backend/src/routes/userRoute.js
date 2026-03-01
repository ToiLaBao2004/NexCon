import express from 'express';
import { getCurrentUser } from '../controllers/userController.js';

const userRouter = express.Router();

userRouter.get('/me', getCurrentUser);

export default userRouter;