import express from 'express';
import { createMessageReport, createUserReport, getMyReports } from '../controllers/reportController.js';

const reportRouter = express.Router();

reportRouter.get('/my', getMyReports);
reportRouter.post('/messages/:messageId', createMessageReport);
reportRouter.post('/users/:userId', createUserReport);

export default reportRouter;
