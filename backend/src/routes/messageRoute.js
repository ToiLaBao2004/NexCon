import express from 'express';
import { sendMessage, recallMessage, pinMessage, searchMessages, reactToMessage, getSignedMediaUrl } from '../controllers/messageController.js';
import { checkMessagePermission, checkConversationMembership } from '../middlewares/messageMiddleware.js';
import { upload, handleUploadError } from '../middlewares/uploadMiddleware.js';

const messageRouter = express.Router();

messageRouter.post('/send', upload.single('file'), handleUploadError, checkMessagePermission, sendMessage);
messageRouter.put('/recall', checkConversationMembership, recallMessage);
messageRouter.put('/pin', checkConversationMembership, pinMessage);
messageRouter.get('/search', searchMessages);
messageRouter.put('/:messageId/react', checkConversationMembership, reactToMessage);
messageRouter.get('/:messageId/media-url', getSignedMediaUrl);

export default messageRouter;