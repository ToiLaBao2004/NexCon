import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from "../models/userModel.js";
import crypto from "crypto";

passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: `${process.env.BACKEND_URL}/api/auth/google/callback`,
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                const email = profile.emails?.[0]?.value;
                const avatarUrl = profile.photos?.[0]?.value;
                const displayName = profile.displayName;

                if (!email) {
                    return done(new Error("Google account không trả về email"), null);
                }

                let user = await User.findOne({ googleId: profile.id });
                if (user) {
                    if (!user.avatarUrl && avatarUrl) {
                        user.avatarUrl = avatarUrl;
                        await user.save();
                    }
                    return done(null, user);
                }

                user = await User.findOne({ email });
                if (user) {
                    user.googleId = profile.id;

                    if (!user.displayName && displayName) {
                        user.displayName = displayName;
                    }

                    if (!user.avatarUrl && avatarUrl) {
                        user.avatarUrl = avatarUrl;
                    }

                    await user.save();
                    return done(null, user);
                }

                const newUser = new User({
                    email,
                    password: crypto.randomBytes(16).toString("hex"),
                    displayName: displayName || email.split("@")[0],
                    googleId: profile.id,
                    avatarUrl,
                });

                await newUser.save();
                return done(null, newUser);
            } catch (error) {
                return done(error, null);
            }
        }
    )
);

export default passport;