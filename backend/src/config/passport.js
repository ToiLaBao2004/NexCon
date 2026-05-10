import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from "../models/userModel.js";
import crypto from "crypto";
import { upLoadImageFromBuffer } from "../middlewares/uploadMiddleware.js";

export async function saveGoogleAvatarToCloudinary(url) {
    if (!url) return { avatarUrl: "", avatarId: "" };

    const res = await fetch(url);
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await upLoadImageFromBuffer(buffer, "NexCon/avatars");
    return {
        avatarUrl: result.secure_url,
        avatarId: result.public_id,
    };
}

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
                const googleAvatar = profile.photos?.[0]?.value;
                const displayName = profile.displayName;

                if (!email) {
                    return done(new Error("Google account không trả về email"), null);
                }

                let user = await User.findOne({ $or: [{ googleId: profile.id }, { email }] });

                if (user) {
                    user.googleId = profile.id;
                    if (!user.displayName && displayName) user.displayName = displayName;

                    if (!user.avatarUrl && googleAvatar) {
                        const uploaded = await saveGoogleAvatarToCloudinary(googleAvatar);
                        user.avatarUrl = uploaded.avatarUrl;
                        user.avatarId = uploaded.avatarId;
                    }

                    await user.save();
                    return done(null, user);
                }

                let avatarUrl = "";
                let avatarId = "";

                if (googleAvatar) {
                    const uploaded = await saveGoogleAvatarToCloudinary(googleAvatar);
                    avatarUrl = uploaded.avatarUrl;
                    avatarId = uploaded.avatarId;
                }

                const newUser = await User.create({
                    email,
                    password: crypto.randomBytes(16).toString("hex"),
                    displayName: displayName || email.split("@")[0],
                    googleId: profile.id,
                    avatarUrl,
                    avatarId,
                });

                return done(null, newUser);
            } catch (error) {
                return done(error, null);
            }
        }
    )
);

export default passport;