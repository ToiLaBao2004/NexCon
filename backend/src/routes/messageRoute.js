import express from 'express';
import { sendDirectMessage } from '../controllers/messageController.js';

const messageRouter = express.Router();

messageRouter.post('/send-direct', sendDirectMessage);

export default messageRouter;