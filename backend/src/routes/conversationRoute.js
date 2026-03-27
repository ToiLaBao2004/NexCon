import express from 'express';
import { createConversation, getConversations, getMessages, getMediaByType, markAsSeen, updateGroupName, disbandGroupByAdmin, clearConversation } from '../controllers/conversationController.js';
import { checkFriendship } from '../middlewares/friendMiddleware.js';

const conversationRouter = express.Router();

conversationRouter.post('/create-conversation', checkFriendship, createConversation);
conversationRouter.get('/get-conversations', getConversations);
conversationRouter.get('/:conversationId/messages', getMessages);
conversationRouter.get('/:conversationId/media', getMediaByType);
conversationRouter.patch('/:conversationId/mark-seen', markAsSeen);
conversationRouter.put('/:conversationId/update-group-name', updateGroupName);
conversationRouter.delete('/:conversationId/disband-group', disbandGroupByAdmin);
conversationRouter.delete('/:conversationId/clear', clearConversation);

export default conversationRouter;