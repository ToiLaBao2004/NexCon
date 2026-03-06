import express from 'express';
import { getNotifications, markAsRead, markAllAsRead, markAsUnread } from '../controllers/notificationController.js';

const notificationRouter = express.Router();

notificationRouter.get('/', getNotifications);
notificationRouter.put('/:id/mark-as-read', markAsRead);
notificationRouter.patch('/mark-all-as-read', markAllAsRead);
notificationRouter.put('/:id/mark-as-unread', markAsUnread);

export default notificationRouter;