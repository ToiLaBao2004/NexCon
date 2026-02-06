import express from 'express';
import { sendDirectMessage } from '../controllers/messageController.js';
import { checkFriendship } from '../middlewares/friendMiddleware.js';

const messageRouter = express.Router();

messageRouter.post('/send-direct', checkFriendship, sendDirectMessage);

export default messageRouter;