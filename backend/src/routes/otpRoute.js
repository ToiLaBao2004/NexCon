import express from 'express';
import { sendOtpMakeUser, sendOtpResetPassword, verifyOtpResetPassword } from '../controllers/otpController.js';
import {
	otpCreateIpLimiter,
	otpCreateEmailLimiter,
	otpResetIpLimiter,
	otpResetEmailLimiter
} from '../middlewares/rateLimiters.js';

const otpRouter = express.Router();

otpRouter.post('/otp-create-user', otpCreateIpLimiter, otpCreateEmailLimiter, sendOtpMakeUser);
otpRouter.post('/otp-reset-password', otpResetIpLimiter, otpResetEmailLimiter, sendOtpResetPassword);
otpRouter.post('/otp-verify-reset-password', verifyOtpResetPassword);

export default otpRouter;