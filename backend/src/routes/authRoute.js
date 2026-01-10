import express from 'express';
import { signUp, signIn, signOut, verifyValidFieldsSignUp, updateNewPassword } from '../controllers/authController.js';

const authRouter = express.Router();

authRouter.post('/verify-valid-fields-signup', verifyValidFieldsSignUp);
authRouter.post('/signup', signUp);
authRouter.post('/signin', signIn);
authRouter.post('/signout', signOut);
authRouter.put('/update-new-password', updateNewPassword)

export default authRouter;