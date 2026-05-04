import express from 'express';
import {
    signUp, signIn, signOut, signOutAll, verifyValidFieldsSignUp,
    resetNewPassword, googleAuthCallback, refreshToken, googleSuccess,
    getSessions, signOutBySession
} from '../controllers/authController.js';
import passport from '../config/passport.js';

const authRouter = express.Router();

authRouter.post('/verify-valid-fields-signup', verifyValidFieldsSignUp);
authRouter.post('/signup', signUp);
authRouter.post('/signin', signIn);
authRouter.post('/signout', signOut);
authRouter.post('/signout-all', signOutAll);
authRouter.get('/sessions', getSessions);
authRouter.delete('/sessions/:sessionId', signOutBySession);
authRouter.put('/reset-new-password', resetNewPassword)

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

export default authRouter;