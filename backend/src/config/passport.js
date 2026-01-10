import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from '../models/userModel.js';
import crypto from 'crypto';

passport.use(
    new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${process.env.BACKEND_URL}/auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
        try {
            let user = await User.findOne({ googleId: profile.id });
            if (user) return done(null, user);
            user = await User.findOne({ email: profile.emails[0].value });
            if (user) {
                user.googleId = profile.id;
                await user.save();
                return done(null, user);
            }
            const newUser = new User({
                username: profile.emails[0].value.split('@')[0],
                email: profile.emails[0].value,
                password: crypto.randomBytes(16).toString('hex'), // generate a random password
                displayName: profile.displayName,
                googleId: profile.id,
            });
            await newUser.save();
            return done(null, newUser);
        } catch (error) {
            return done(error, null);
        }
    }
));

export default passport;