import express from 'express';
import { sendMessage, createReminderSystemMessage, recallMessage, pinMessage, searchMessages, reactToMessage, getSignedMediaUrl, forwardMessage } from '../controllers/messageController.js';
import { checkMessagePermission, checkConversationMembership } from '../middlewares/messageMiddleware.js';
import { upload, handleUploadError } from '../middlewares/uploadMiddleware.js';

const messageRouter = express.Router();

messageRouter.post('/system/reminder-created', checkMessagePermission, createReminderSystemMessage);
messageRouter.post('/send', upload.single('file'), handleUploadError, checkMessagePermission, sendMessage);
messageRouter.put('/recall', checkConversationMembership, recallMessage);
messageRouter.put('/pin', checkConversationMembership, pinMessage);
messageRouter.get('/search', searchMessages);
messageRouter.put('/:messageId/react', checkConversationMembership, reactToMessage);
messageRouter.get('/:messageId/media-url', getSignedMediaUrl);
messageRouter.post('/:messageId/forward', checkConversationMembership, forwardMessage);

export default messageRouter;