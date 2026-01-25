import express from 'express';
import { sendFriendRequest } from '../controllers/friendController.js';

const friendRouter = express.Router();

friendRouter.post('/send-request', sendFriendRequest);

export default friendRouter;