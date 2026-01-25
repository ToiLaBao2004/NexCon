import express from 'express';
import { sendFriendRequest, acceptFriendRequest, rejectFriendRequest, 
    resendFriendRequest, getFriendRequests } from '../controllers/friendController.js';

const friendRouter = express.Router();

friendRouter.post('/send-request', sendFriendRequest);
friendRouter.post('/accept-request/:requestId', acceptFriendRequest);
friendRouter.post('/reject-request/:requestId', rejectFriendRequest);
friendRouter.post('/resend-request/:requestId', resendFriendRequest);
friendRouter.get('/requests', getFriendRequests);

export default friendRouter;