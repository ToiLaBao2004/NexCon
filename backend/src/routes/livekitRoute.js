import express from 'express';
import { getLivekitRoomInfo, getLivekitToken } from '../controllers/livekitController.js';

const livekitRouter = express.Router();

livekitRouter.get('/room-info', getLivekitRoomInfo);
livekitRouter.post('/token', getLivekitToken);

export default livekitRouter;
