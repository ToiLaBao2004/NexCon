import express from 'express';
import { getLivekitToken } from '../controllers/livekitController.js';

const livekitRouter = express.Router();

livekitRouter.post('/token', getLivekitToken);

export default livekitRouter;
