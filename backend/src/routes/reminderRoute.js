import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import {
    createReminder,
    createSharedReminderFromMessage,
    getReminderSummary,
    getMissedReminders,
    getSharedReminderOverview,
    getReminderById,
    getReminders,
    updateReminder,
    snoozeReminder,
    dismissReminder,
    updateSharedReminderParticipation,
    deleteRemindersByScope,
    deleteReminder,
} from '../controllers/reminderController.js';

const reminderRouter = express.Router();

reminderRouter.use(authMiddleware);

reminderRouter.post('/', createReminder);
reminderRouter.post('/shared/from-message', createSharedReminderFromMessage);
reminderRouter.patch('/shared/:sharedKey/participation', updateSharedReminderParticipation);
reminderRouter.get('/shared/:sharedKey/overview', getSharedReminderOverview);
reminderRouter.get('/', getReminders);
reminderRouter.get('/summary', getReminderSummary);
reminderRouter.get('/missed', getMissedReminders);
reminderRouter.delete('/bulk', deleteRemindersByScope);
reminderRouter.get('/:id', getReminderById);
reminderRouter.patch('/:id', updateReminder);
reminderRouter.post('/:id/snooze', snoozeReminder);
reminderRouter.post('/:id/dismiss', dismissReminder);
reminderRouter.delete('/:id', deleteReminder);

export default reminderRouter;
