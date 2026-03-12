import express from 'express';
import { sendMessage, recallMessage, pinMessage } from '../controllers/messageController.js';
import { checkMessagePermission } from '../middlewares/messageMiddleware.js';
import { upload, handleUploadError } from '../middlewares/uploadMiddleware.js';

const messageRouter = express.Router();

messageRouter.post('/send', upload.single('file'), handleUploadError, checkMessagePermission, sendMessage);
messageRouter.put('/recall', recallMessage);
messageRouter.put('/pin', pinMessage);

export default messageRouter;