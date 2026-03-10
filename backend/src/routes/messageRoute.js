import express from 'express';
import { sendDirectMessage, sendGroupMessage, recallMessagge, pinMessage } from '../controllers/messageController.js';
import { checkFriendship } from '../middlewares/friendMiddleware.js';
import { checkGroupMembership } from '../middlewares/groupMiddleware.js';
const messageRouter = express.Router();

messageRouter.post('/send-direct', checkFriendship, sendDirectMessage);
messageRouter.post('/send-group', checkGroupMembership, sendGroupMessage);
messageRouter.put('/recall', recallMessagge);
messageRouter.put('/pin', pinMessage);

export default messageRouter;