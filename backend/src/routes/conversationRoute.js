import express from 'express';
import { createConversation, getConversations, getMessages, getMediaByType, markAsSeen, markAsUnread, toggleConversationPin, updateGroupName, updateGroupAvatar, disbandGroupByAdmin, clearConversation, addMembers, updateSettings, handleApproval, getApprovalQueue, transferAdminRole, removeMember, leaveGroup } from '../controllers/conversationController.js';
import { checkFriendship } from '../middlewares/friendMiddleware.js';
import { upload } from '../middlewares/uploadMiddleware.js';

const conversationRouter = express.Router();

conversationRouter.post('/create-conversation', checkFriendship, createConversation);
conversationRouter.get('/get-conversations', getConversations);
conversationRouter.get('/:conversationId/messages', getMessages);
conversationRouter.get('/:conversationId/media', getMediaByType);
conversationRouter.patch('/:conversationId/mark-seen', markAsSeen);
conversationRouter.patch('/:conversationId/mark-unread', markAsUnread);
conversationRouter.patch('/:conversationId/pin', toggleConversationPin);
conversationRouter.put('/:conversationId/update-group-name', updateGroupName);
conversationRouter.post('/:conversationId/update-group-avatar', upload.single('file'), updateGroupAvatar);
conversationRouter.delete('/:conversationId/disband-group', disbandGroupByAdmin);
conversationRouter.delete('/:conversationId/clear', clearConversation);
conversationRouter.post('/:conversationId/add-members', checkFriendship, addMembers);
conversationRouter.patch('/:conversationId/settings', updateSettings);
conversationRouter.post('/:conversationId/approvals', handleApproval);
conversationRouter.get('/:conversationId/approvals', getApprovalQueue);
conversationRouter.patch('/:conversationId/admins/:memberId', transferAdminRole);
conversationRouter.delete('/:conversationId/members/:memberId', removeMember);
conversationRouter.delete('/:conversationId/leave', leaveGroup);

export default conversationRouter;