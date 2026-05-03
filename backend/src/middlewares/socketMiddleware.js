import jwt from "jsonwebtoken";
import User from "../models/userModel.js";

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

        const user = await User.findById(decoded.userId).select("-password");

        if (!user) {
            return next(new Error("User does not exist"));
        }

        socket.user = user;

        next();

    } catch (error) {
        console.error("An error occurred while verifying JWT in socketMiddleware", error);

        if (error.name === 'TokenExpiredError') {
            return next(new Error("jwt expired")); // ← client nhận biết được
        }

        next(new Error("Unauthorized"));
    };
}