import express from 'express';
import { createConversation, getConversations, getMessages, markAsSeen, updateGroupName } from '../controllers/conversationController.js';
import { checkFriendship } from '../middlewares/friendMiddleware.js';

const conversationRouter = express.Router();

conversationRouter.post('/create-conversation', checkFriendship, createConversation);
conversationRouter.get('/get-conversations', getConversations);
conversationRouter.get('/:conversationId/messages', getMessages);
conversationRouter.patch('/:conversationId/mark-seen', markAsSeen);
conversationRouter.put('/:conversationId/update-group-name', updateGroupName);

export default conversationRouter;