import express from 'express';
import { sendFriendRequest, acceptFriendRequest, rejectFriendRequest, 
    resendFriendRequest, getFriendRequests, unfriendUser, blockUser, unblockUser } from '../controllers/friendController.js';

const friendRouter = express.Router();

friendRouter.post('/send-request', sendFriendRequest);
friendRouter.post('/accept-request/:requestId', acceptFriendRequest);
friendRouter.post('/reject-request/:requestId', rejectFriendRequest);
friendRouter.post('/resend-request/:requestId', resendFriendRequest);
friendRouter.get('/requests', getFriendRequests);
friendRouter.delete('/unfriend/:friendId', unfriendUser);
friendRouter.post('/block/:userIdBlocked', blockUser);
friendRouter.delete('/unblock/:userIdUnblocked', unblockUser);

export default friendRouter;