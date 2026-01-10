import express from 'express';
import { sendOtpMakeUser, sendOtpResetPassword, verifyOtpResetPassword } from '../controllers/otpController.js';

const otpRouter = express.Router();

otpRouter.post('/otp-create-user', sendOtpMakeUser);
otpRouter.post('/otp-reset-password', sendOtpResetPassword);
otpRouter.post('/otp-verify-reset-password', verifyOtpResetPassword);

export default otpRouter;