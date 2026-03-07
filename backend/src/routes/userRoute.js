import express from 'express';
import { getCurrentUser, updateAvatar, updateProfile } from '../controllers/userController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { upload } from '../middlewares/uploadMiddleware.js';

const userRouter = express.Router();

userRouter.get('/me', getCurrentUser);
userRouter.put('/update-profile', authMiddleware, updateProfile);
userRouter.post('/update-avatar', authMiddleware, upload.single('file'), updateAvatar);


export default userRouter;