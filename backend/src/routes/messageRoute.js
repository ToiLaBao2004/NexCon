import express from 'express';
import { sendDirectMessage, sendGroupMessage, recallMessagge } from '../controllers/messageController.js';
import { checkFriendship } from '../middlewares/friendMiddleware.js';
import { checkGroupMembership } from '../middlewares/groupMiddleware.js';
const messageRouter = express.Router();

messageRouter.post('/send-direct', checkFriendship, sendDirectMessage);
messageRouter.post('/send-group', checkGroupMembership, sendGroupMessage);
messageRouter.put('/recall', recallMessagge);

export default messageRouter;