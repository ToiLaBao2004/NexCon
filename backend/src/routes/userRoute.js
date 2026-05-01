import express from 'express';
import {
    getCurrentUser, updateAvatar, updateProfile, updateMusic, searchMusic,
    removeMusic, changePassword, searchUsers, getUserById
} from '../controllers/userController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { upload } from '../middlewares/uploadMiddleware.js';

const userRouter = express.Router();

userRouter.get('/me', authMiddleware, getCurrentUser);
userRouter.get('/search', authMiddleware, searchUsers);
userRouter.put('/update-profile', authMiddleware, updateProfile);
userRouter.post('/update-avatar', authMiddleware, upload.single('file'), updateAvatar);
userRouter.put('/me/music/', authMiddleware, updateMusic);
userRouter.get('/music/search', authMiddleware, searchMusic);
userRouter.delete('/me/music', authMiddleware, removeMusic);
userRouter.put('/change-password', authMiddleware, changePassword);
userRouter.get('/get-user-by-id/:id', authMiddleware, getUserById);

export default userRouter;