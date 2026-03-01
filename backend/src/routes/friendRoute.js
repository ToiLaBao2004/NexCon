import express from 'express';
import {
    sendFriendRequest, acceptFriendRequest, rejectFriendRequest,
    resendFriendRequest, getFriendRequests, unfriendUser, blockUser, unblockUser,
    getAllFriends, getFriendRequestsSended, getUserBlockedList,
    setFriendNickname, cancelFriendRequest
} from '../controllers/friendController.js';

const friendRouter = express.Router();

friendRouter.post('/send-request', sendFriendRequest);
friendRouter.post('/accept-request/:requestId', acceptFriendRequest);
friendRouter.post('/reject-request/:requestId', rejectFriendRequest);
friendRouter.post('/resend-request/:requestId', resendFriendRequest);
friendRouter.delete('/cancel-request/:requestId', cancelFriendRequest);
friendRouter.get('/requests', getFriendRequests);
friendRouter.delete('/unfriend/:friendId', unfriendUser);
friendRouter.post('/block/:userIdBlocked', blockUser);
friendRouter.delete('/unblock/:userIdUnblocked', unblockUser);
friendRouter.get('/get-friends', getAllFriends);
friendRouter.get('/requests-sended', getFriendRequestsSended);
friendRouter.get('/blocked-users', getUserBlockedList);
friendRouter.post('/set-nickname/:friendId', setFriendNickname);

export default friendRouter;