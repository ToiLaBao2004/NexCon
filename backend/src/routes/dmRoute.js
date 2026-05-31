import express from 'express';
import {
    getDisappearingSetting,
    manuallyExpireMessage,
    reportDisappearingScreenshot,
    updateDisappearingSetting,
} from '../controllers/disappearingMessageController.js';
import { requireAdmin } from '../middlewares/roleMiddleware.js';

const dmRouter = express.Router();

dmRouter.get('/conversations/:conversationId/disappearing', getDisappearingSetting);
dmRouter.put('/conversations/:conversationId/disappearing', updateDisappearingSetting);
dmRouter.post('/conversations/:conversationId/screenshot', reportDisappearingScreenshot);
dmRouter.post('/messages/:messageId/expire', requireAdmin, manuallyExpireMessage);

export default dmRouter;
