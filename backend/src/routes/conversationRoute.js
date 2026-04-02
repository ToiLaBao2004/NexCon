import express from 'express';
import { createConversation, getConversations, getMessages, getMediaByType, markAsSeen, updateGroupName, disbandGroupByAdmin, clearConversation, addMembers, updateSettings, handleApproval, getApprovalQueue, transferAdminRole, removeMember } from '../controllers/conversationController.js';
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
conversationRouter.post('/:conversationId/add-members', addMembers);
conversationRouter.patch('/:conversationId/settings', updateSettings);
conversationRouter.post('/:conversationId/approvals', handleApproval);
conversationRouter.get('/:conversationId/approvals', getApprovalQueue);
conversationRouter.patch('/:conversationId/admins/:memberId', transferAdminRole);
conversationRouter.delete('/:conversationId/members/:memberId', removeMember);

export default conversationRouter;