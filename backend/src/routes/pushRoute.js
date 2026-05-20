import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import {
    getVapidPublicKey,
    subscribePush,
    unsubscribePush,
    saveFcmToken,
    removeFcmToken,
    handleCallAction,
} from '../controllers/pushController.js';

const pushRouter = express.Router();

pushRouter.get('/vapid-public-key', getVapidPublicKey);
pushRouter.post('/subscribe', authMiddleware, subscribePush);
pushRouter.delete('/unsubscribe', authMiddleware, unsubscribePush);
pushRouter.post('/fcm-token', authMiddleware, saveFcmToken);
pushRouter.delete('/fcm-token', authMiddleware, removeFcmToken);
pushRouter.post('/call-action', handleCallAction);

export default pushRouter;
