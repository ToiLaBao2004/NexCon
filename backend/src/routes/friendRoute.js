import express from 'express';
import { sendFriendRequest, acceptFriendRequest, rejectFriendRequest, 
    resendFriendRequest } from '../controllers/friendController.js';

const friendRouter = express.Router();

friendRouter.post('/send-request', sendFriendRequest);
friendRouter.post('/accept-request/:requestId', acceptFriendRequest);
friendRouter.post('/reject-request/:requestId', rejectFriendRequest);
friendRouter.post('/resend-request/:requestId', resendFriendRequest);

export default friendRouter;