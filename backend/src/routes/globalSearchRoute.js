import express from 'express';
import { globalSearch, globalSearchStream } from '../controllers/globalSearchController.js';

const globalSearchRouter = express.Router();

globalSearchRouter.get('/global/stream', globalSearchStream);
globalSearchRouter.get('/global', globalSearch);

export default globalSearchRouter;
