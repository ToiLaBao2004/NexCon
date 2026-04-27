import express from 'express';
import { getLivekitRoomInfo, getLivekitToken, endLivekitMeeting } from '../controllers/livekitController.js';

const livekitRouter = express.Router();

livekitRouter.get('/room-info', getLivekitRoomInfo);
livekitRouter.post('/token', getLivekitToken);
livekitRouter.delete('/end/:roomName', endLivekitMeeting);

export default livekitRouter;
