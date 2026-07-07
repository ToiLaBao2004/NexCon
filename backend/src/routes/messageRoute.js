import express from 'express';
import { sendMessage, createReminderSystemMessage, recallMessage, pinMessage, searchMessages, reactToMessage, getSignedMediaUrl, forwardMessage, getMentionMessages } from '../controllers/messageController.js';
import { submitMessageAppeal } from '../controllers/messageAppealController.js';
import { checkMessagePermission, checkConversationMembership } from '../middlewares/messageMiddleware.js';
import { upload, handleUploadError } from '../middlewares/uploadMiddleware.js';

const messageRouter = express.Router();

messageRouter.post('/system/reminder-created', checkMessagePermission, createReminderSystemMessage);
messageRouter.post('/send', upload.single('file'), handleUploadError, checkMessagePermission, sendMessage);
messageRouter.get('/mentions', getMentionMessages);
messageRouter.put('/recall', checkConversationMembership, recallMessage);
messageRouter.put('/pin', checkConversationMembership, pinMessage);
messageRouter.get('/search', searchMessages);
messageRouter.put('/:messageId/react', checkConversationMembership, reactToMessage);
messageRouter.post('/:messageId/appeals', checkConversationMembership, submitMessageAppeal);
messageRouter.get('/:messageId/media-url', getSignedMediaUrl);
messageRouter.post('/:messageId/forward', checkConversationMembership, forwardMessage);

export default messageRouter;
