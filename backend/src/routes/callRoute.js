import express from 'express';
import {
    getCallHistory,
    getCallsByConversation,
    getCallDetail
} from '../controllers/callController.js';

const callRouter = express.Router();

// Lấy lịch sử cuộc gọi của user (có cursor pagination)
callRouter.get('/history', getCallHistory);

// Lấy lịch sử cuộc gọi theo conversation
callRouter.get('/conversation/:conversationId', getCallsByConversation);

// Lấy chi tiết một cuộc gọi
callRouter.get('/:callId', getCallDetail);

export default callRouter;
