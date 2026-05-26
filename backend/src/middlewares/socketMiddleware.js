import jwt from "jsonwebtoken";
import User from "../models/userModel.js";
import Session from "../models/sessionModel.js";

const SOCKET_SESSION_REVALIDATE_MS = Number(process.env.SOCKET_SESSION_REVALIDATE_MS || 60000);

async function findValidSession(userId, sessionId) {
    if (!userId || !sessionId) {
        return null;
    }

    const session = await Session.findOne({
        _id: sessionId,
        userId,
    }).select('_id userId expiresAt').lean();

    if (!session || session.expiresAt < Date.now()) {
        return null;
    }

    return session;
}

export async function validateSocketSession(socket) {
    const userId = socket.user?._id?.toString();
    const sessionId = socket.sessionId?.toString();
    const now = Date.now();

    if (
        socket.data?.lastSessionValidationAt
        && now - socket.data.lastSessionValidationAt < SOCKET_SESSION_REVALIDATE_MS
    ) {
        return true;
    }

    const isValid = Boolean(await findValidSession(userId, sessionId));
    if (isValid) {
        socket.data.lastSessionValidationAt = now;
    }

    return isValid;
}

export const socketAuthMiddleware = async (socket, next) => {
    try {
        const token = socket.handshake.auth?.token;
        if (!token) {
            return next(new Error("Unauthorized - Token does not exist"));
        }

        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

        if (!decoded) {
            return next(new Error("Unauthorized - Invalid or expired token"));
        }

        const session = await findValidSession(decoded.userId, decoded.sessionId);
        if (!session) {
            return next(new Error("Unauthorized - Session expired or revoked"));
        }

        const user = await User.findById(decoded.userId).select("-password").lean();

        if (!user) {
            return next(new Error("User does not exist"));
        }
        if (user.lock?.isLocked) {
            return next(new Error("Account locked"));
        }

        socket.user = user;
        socket.sessionId = session._id.toString();

        next();

    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            console.info("[SocketAuth] Access token expired; client should refresh and reconnect.");
            return next(new Error("jwt expired")); // ← client nhận biết được
        }

        console.error("An error occurred while verifying JWT in socketMiddleware", error);

        next(new Error("Unauthorized"));
    };
}
