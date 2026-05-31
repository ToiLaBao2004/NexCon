import express from 'express';
import { expireDisappearingBatch } from '../controllers/disappearingMessageController.js';
import { requireInternalJobSecret } from '../middlewares/internalJobMiddleware.js';

const internalDmRouter = express.Router();

internalDmRouter.delete('/expire-batch', requireInternalJobSecret, expireDisappearingBatch);

export default internalDmRouter;
