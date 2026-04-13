import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import {
    getVapidPublicKey,
    subscribePush,
    unsubscribePush,
} from '../controllers/pushController.js';

const pushRouter = express.Router();

pushRouter.get('/vapid-public-key', getVapidPublicKey);
pushRouter.post('/subscribe', authMiddleware, subscribePush);
pushRouter.delete('/unsubscribe', authMiddleware, unsubscribePush);

export default pushRouter;
