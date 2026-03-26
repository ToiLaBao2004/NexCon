import express from 'express';
import { createConversation, getConversations, getMessages, getMediaByType, markAsSeen, updateGroupName, disbandGroupByAdmin } from '../controllers/conversationController.js';
import { checkFriendship } from '../middlewares/friendMiddleware.js';

const conversationRouter = express.Router();

conversationRouter.post('/create-conversation', checkFriendship, createConversation);
conversationRouter.get('/get-conversations', getConversations);
conversationRouter.get('/:conversationId/messages', getMessages);
conversationRouter.get('/:conversationId/media', getMediaByType);
conversationRouter.patch('/:conversationId/mark-seen', markAsSeen);
conversationRouter.put('/:conversationId/update-group-name', updateGroupName);
conversationRouter.delete('/:conversationId/disband-group', disbandGroupByAdmin);

export default conversationRouter;