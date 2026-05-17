import express from 'express';
import {
    signUp, signIn, signOut, signOutAll, verifyValidFieldsSignUp,
    resetNewPassword, googleAuthCallback, refreshToken, googleSuccess,
    getSessions, signOutBySession, googleMobileAuth, submitLockedAppeal
} from '../controllers/authController.js';
import passport from '../config/passport.js';
import {
    signupIpLimiter,
    signupEmailLimiter,
    signinIpLimiter,
    signinEmailLimiter
} from '../middlewares/rateLimiters.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const authRouter = express.Router();

authRouter.get('/health', (_req, res) => {
    res.status(200).json({ ok: true });
});

authRouter.post('/verify-valid-fields-signup', signupIpLimiter, signupEmailLimiter, verifyValidFieldsSignUp);
authRouter.post('/signup', signupIpLimiter, signupEmailLimiter, signUp);
authRouter.post('/signin', signinIpLimiter, signinEmailLimiter, signIn);
authRouter.post('/locked-appeals', submitLockedAppeal);
authRouter.post('/signout', authMiddleware, signOut);
authRouter.post('/signout-all', authMiddleware, signOutAll);
authRouter.post('/sessions', getSessions); // mobile
authRouter.get('/sessions', getSessions); // web
authRouter.delete('/sessions/:sessionId', authMiddleware, signOutBySession);
authRouter.put('/reset-new-password', signupIpLimiter, resetNewPassword)

authRouter.get(
    '/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

authRouter.get(
    '/google/callback',
    passport.authenticate('google', {
        session: false,
        failureRedirect: `${process.env.FRONTEND_URL}/login?error=google`
    }),
    googleAuthCallback
);

authRouter.get('/google/success', googleSuccess);

authRouter.post('/refresh-token', refreshToken);

authRouter.post('/google/mobile', signinIpLimiter, googleMobileAuth);

export default authRouter;
