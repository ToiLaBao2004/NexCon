import express from 'express';
import { getCurrentUser, searchUserByEmailAndPhone} from '../controllers/userController.js';

const userRouter = express.Router();

userRouter.get('/me', getCurrentUser);
userRouter.get('/search', searchUserByEmailAndPhone);

export default userRouter;