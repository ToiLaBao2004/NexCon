import express from 'express';
import { sendMessage, recallMessage, pinMessage, searchMessages, reactToMessage } from '../controllers/messageController.js';
import { checkMessagePermission, checkConversationMembership } from '../middlewares/messageMiddleware.js';
import { upload, handleUploadError } from '../middlewares/uploadMiddleware.js';

const messageRouter = express.Router();

messageRouter.post('/send', upload.single('file'), handleUploadError, checkMessagePermission, sendMessage);
messageRouter.put('/recall', recallMessage);
messageRouter.put('/pin', pinMessage);
messageRouter.get('/search', searchMessages);
messageRouter.put('/:messageId/react', checkConversationMembership, reactToMessage);

export default messageRouter;