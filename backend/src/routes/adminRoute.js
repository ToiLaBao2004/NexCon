import express from 'express';
import {
    addAdminUserViolation,
    aiReviewMessageReports,
    getAdminObservability,
    getAdminStats,
    getAdminUserAssets,
    getAdminUserAuditLogs,
    getAdminUserConversations,
    getAdminUserMessages,
    getAdminUserProfile,
    getAdminUserResolvedReports,
    listAdminAppeals,
    listAdminReports,
    listAdminUsers,
    lockAdminUser,
    markAdminReportReviewing,
    resolveAdminReport,
    reviewAdminAppeal,
    unlockAdminUser,
} from '../controllers/adminController.js';
import { requireAdmin } from '../middlewares/roleMiddleware.js';

const adminRouter = express.Router();

adminRouter.use(requireAdmin);

adminRouter.get('/stats', getAdminStats);
adminRouter.get('/observability', getAdminObservability);
adminRouter.get('/users', listAdminUsers);
adminRouter.get('/users/:userId/profile', getAdminUserProfile);
adminRouter.get('/users/:userId/audit-logs', getAdminUserAuditLogs);
adminRouter.get('/users/:userId/conversations', getAdminUserConversations);
adminRouter.get('/users/:userId/messages', getAdminUserMessages);
adminRouter.get('/users/:userId/assets', getAdminUserAssets);
adminRouter.get('/users/:userId/resolved-reports', getAdminUserResolvedReports);
adminRouter.post('/users/:userId/violations', addAdminUserViolation);
adminRouter.post('/users/:userId/lock', lockAdminUser);
adminRouter.post('/users/:userId/unlock', unlockAdminUser);

adminRouter.get('/reports', listAdminReports);
adminRouter.post('/reports/messages/ai-review', aiReviewMessageReports);
adminRouter.patch('/reports/:reportId/reviewing', markAdminReportReviewing);
adminRouter.patch('/reports/:reportId/resolve', resolveAdminReport);

adminRouter.get('/appeals', listAdminAppeals);
adminRouter.patch('/appeals/:appealId/review', reviewAdminAppeal);

export default adminRouter;
