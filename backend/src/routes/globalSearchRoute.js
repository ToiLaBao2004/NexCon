import express from 'express';
import { globalSearch } from '../controllers/globalSearchController.js';

const globalSearchRouter = express.Router();

globalSearchRouter.get('/global', globalSearch);

export default globalSearchRouter;
