import FriendRequest from "../models/friendRequestModel.js";
import User from '../models/userModel.js';
import Friend from '../models/friendModel.js';
import Notification from '../models/notificationModel.js';
import BlockUser from "../models/blockUserModel.js";
import Conversation from "../models/conversationModel.js";
import { io, getReceiverSocketId, emitToUser, emitOnlineUsers, getOnlineUserIdsForUsers } from "../socket/index.js";
import { createNotification } from "../services/notificationServices.js";
import { checkFieldFormat } from "../utils/fieldFormat.js";
import { maskLockedUserDoc } from "../utils/lockedUser.js";
import { applyProfileVisibility } from "../utils/profilePrivacy.js";
import { getVisiblePresencesForUsers } from "../services/userStatusService.js";
import {
    buildReadCacheKey,
    createPendingJson,
    getCachedJson,
    getPendingJson,
    getPositiveIntEnv,
    invalidateFriendReadCache,
    setCachedJson,
} from "../utils/readCache.js";
import validator from "validator";

const toFriendItem = (friendship, user) => {
    const safeUser = maskLockedUserDoc(user);
    return {
        _id: friendship._id,
        friendId: safeUser._id,
        displayName: safeUser.displayName,
        avatarUrl: safeUser.avatarUrl,
        createdAt: friendship.createdAt
    };
};

const MAX_FRIENDS = 500;
const FRIEND_LIMIT_MESSAGE = `Mỗi người chỉ có thể có tối đa ${MAX_FRIENDS} bạn bè.`;
const MAX_PENDING_SENT_REQUESTS = 100;
const PENDING_REQUEST_LIMIT_MESSAGE = `Bạn chỉ có thể có tối đa ${MAX_PENDING_SENT_REQUESTS} lời mời kết bạn đang chờ xử lý.`;
const MAX_FRIEND_REQUEST_MESSAGE_LENGTH = 300;
const DEFAULT_SUGGESTION_LIMIT = 20;
const MAX_SUGGESTION_LIMIT = 50;
const FRIENDS_LIST_CACHE_TTL_MS = getPositiveIntEnv('FRIENDS_LIST_CACHE_TTL_MS', 10000);
const FRIEND_SUGGESTIONS_CACHE_TTL_MS = getPositiveIntEnv('FRIEND_SUGGESTIONS_CACHE_TTL_MS', 30000);
const GENERIC_EMAIL_DOMAINS = new Set([
    'gmail.com',
    'googlemail.com',
    'yahoo.com',
    'hotmail.com',
    'outlook.com',
    'live.com',
    'icloud.com',
    'proton.me',
    'protonmail.com',
    'yopmail.com',
    'mailinator.com',
    'tempmail.com',
    '10minutemail.com',
]);

const NON_ADMIN_USER_FILTER = { role: { $ne: 'admin' } };
const PROFILE_USER_SELECT = 'displayName email avatarUrl bio phone music profileVisibility lock';

const getIdString = (value) => {
    if (!value) return '';
    return (value._id || value).toString();
};

const normalizeEmailDomain = (email = '') => {
    const domain = email.split('@')[1]?.trim().toLowerCase();
    if (!domain || !domain.includes('.')) return null;
    if (GENERIC_EMAIL_DOMAINS.has(domain)) return null;
    return domain;
};

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const sanitizeProfileForViewer = (user, viewerId, isFriend = false) => {
    return applyProfileVisibility(maskLockedUserDoc(user), { viewerId, isFriend });
};

const getGroupName = (conversation) => {
    const name = conversation?.group?.name?.trim();
    return name || 'Nhóm chung';
};

const recencyScoreFromDate = (dateValue) => {
    if (!dateValue) return 0;
    const timestamp = new Date(dateValue).getTime();
    if (Number.isNaN(timestamp)) return 0;
    const days = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
    if (days <= 7) return 5;
    if (days <= 30) return 3;
    if (days <= 90) return 1;
    return 0;
};

const isRecentlyJoined = (dateValue) => {
    if (!dateValue) return false;
    const timestamp = new Date(dateValue).getTime();
    if (Number.isNaN(timestamp)) return false;
    return Date.now() - timestamp <= 30 * 24 * 60 * 60 * 1000;
};

async function hasReachedFriendLimit(userId) {
    const count = await Friend.countDocuments({
        $or: [{ userA: userId }, { userB: userId }]
    });
    return count >= MAX_FRIENDS;
}

async function checkFriendLimit(...userIds) {
    const results = await Promise.all(userIds.map(hasReachedFriendLimit));
    return results.some(Boolean);
}

async function hasReachedPendingRequestLimit(userId) {
    const count = await FriendRequest.countDocuments({ from: userId, status: 'pending' });
    return count >= MAX_PENDING_SENT_REQUESTS;
}

async function emitSentRequestUpdated(senderId, requestId) {
    const friendRequest = await FriendRequest.findById(requestId)
        .populate('to', PROFILE_USER_SELECT);

    if (friendRequest) {
        const payload = friendRequest.toObject?.() || friendRequest;
        payload.to = sanitizeProfileForViewer(friendRequest.to, senderId, false);
        emitToUser(senderId.toString(), "friend-request-sent-updated", {
            friendRequest: payload
        });
    }
}

export async function sendFriendRequest(req, res) {
    try {
        const sender = req.user;
        const { email, message, targetUserId, userId } = req.body;
        const normalizedEmail = String(email || '').trim().toLowerCase();
        const normalizedTargetUserId = String(targetUserId || userId || '').trim();
        const normalizedMessage = String(message || '').trim();
        if (!normalizedEmail && !normalizedTargetUserId) {
            return res.status(400).json({ message: "Email or user ID is required." });
        }
        if (normalizedTargetUserId && !validator.isMongoId(normalizedTargetUserId)) {
            return res.status(400).json({ message: "Invalid user ID format." });
        }
        if (!normalizedTargetUserId && !validator.isEmail(normalizedEmail)) {
            return res.status(400).json({ message: "Invalid email format." });
        }
        if (normalizedMessage.length > MAX_FRIEND_REQUEST_MESSAGE_LENGTH) {
            return res.status(400).json({
                message: `Friend request message cannot exceed ${MAX_FRIEND_REQUEST_MESSAGE_LENGTH} characters.`,
            });
        }
        const receiver = normalizedTargetUserId
            ? await User.findOne({ _id: normalizedTargetUserId, ...NON_ADMIN_USER_FILTER }).select('_id displayName email avatarUrl lock').lean()
            : await User.findOne({ email: normalizedEmail, ...NON_ADMIN_USER_FILTER }).select('_id displayName email avatarUrl lock').lean();
        if (!receiver) {
            return res.status(404).json({ message: normalizedTargetUserId ? "User not found." : "User with this email not found." });
        }
        if (receiver.lock?.isLocked) {
            return res.status(423).json({ message: 'Không thể gửi lời mời kết bạn tới tài khoản đã bị khóa.' });
        }
        const isBlocked = await BlockUser.findOne({ from: receiver._id, to: sender._id });
        if (isBlocked) {
            return res.status(403).json({ message: "You cannot send a friend request to this user." });
        }
        const blockedBySender = await BlockUser.findOne({ from: sender._id, to: receiver._id });
        if (blockedBySender) {
            await BlockUser.deleteOne({ _id: blockedBySender._id });
            invalidateFriendReadCache([sender._id, receiver._id]);
            // Notify receiver that they are unblocked
            const receiverSocketId = getReceiverSocketId(receiver._id.toString());
            if (receiverSocketId) {
                io.to(receiverSocketId).emit("user-unblocked", {
                    unblockedBy: sender._id.toString()
                });
            }
        }
        if (sender._id.toString() === receiver._id.toString()) {
            return res.status(400).json({ message: 'You cannot send a friend request to yourself.' });
        }
        const alreadyFriends = await Friend.exists({
            $or: [
                { userA: sender._id, userB: receiver._id },
                { userA: receiver._id, userB: sender._id }
            ]
        });
        if (alreadyFriends) {
            return res.status(400).json({ message: 'You are already friends with this user.' });
        }
        if (await checkFriendLimit(sender._id, receiver._id)) {
            return res.status(400).json({ message: FRIEND_LIMIT_MESSAGE });
        }
        const existingRequest = await FriendRequest.findOne({
            from: sender._id,
            to: receiver._id,
            status: 'pending'
        });
        if (existingRequest) {
            return res.status(400).json({ message: 'You already sent a friend request to this user.' });
        }
        if (await hasReachedPendingRequestLimit(sender._id)) {
            return res.status(400).json({ message: PENDING_REQUEST_LIMIT_MESSAGE });
        }
        const rejectedRequest = await FriendRequest.findOne({
            from: sender._id,
            to: receiver._id,
            status: 'rejected'
        });
        if (rejectedRequest) {
            rejectedRequest.status = 'pending';
            rejectedRequest.message = normalizedMessage || undefined;
            await rejectedRequest.save();
            invalidateFriendReadCache([sender._id, receiver._id]);
            await createNotification(receiver._id,
                "Friend Request Resent",
                `${sender.displayName} đã gửi cho bạn một lời mời kết bạn. ${normalizedMessage ? `"${normalizedMessage}"` : ""}`,
                `${process.env.FRONTEND_URL}/people?tab=requests`,
                { actorId: sender._id });
            const populatedRequestDoc = await FriendRequest.findById(rejectedRequest._id)
                .populate('from', PROFILE_USER_SELECT);
            const populatedRequest = populatedRequestDoc?.toObject?.() || populatedRequestDoc;
            if (populatedRequest?.from) {
                populatedRequest.from = sanitizeProfileForViewer(populatedRequest.from, receiver._id, false);
            }
            await emitSentRequestUpdated(sender._id, rejectedRequest._id);
            const receiverSocketId = getReceiverSocketId(receiver._id.toString());
            if (receiverSocketId) {
                io.to(receiverSocketId).emit("new-friend-request", {
                    friendRequest: populatedRequest
                });
            }
            return res.status(201).json({ message: `Đã gửi lời mời kết bạn đến ${receiver.displayName} thành công.` });
        }
        const reverseRequest = await FriendRequest.findOne({
            from: receiver._id,
            to: sender._id,
            status: 'pending'
        });
        if (reverseRequest) {
            reverseRequest.status = 'accepted';
            await reverseRequest.save();
            const newFriend = new Friend({
                userA: receiver._id,
                userB: sender._id
            });
            await newFriend.save();
            invalidateFriendReadCache([sender._id, receiver._id]);
            await createNotification(receiver._id,
                "Friend Request Accepted",
                `${sender.displayName} đã chấp nhận lời mời kết bạn của bạn.`,
                `${process.env.FRONTEND_URL}/people?tab=friends`,
                { actorId: sender._id });
            const receiverSocketId = getReceiverSocketId(receiver._id.toString());
            if (receiverSocketId) {
                io.to(receiverSocketId).emit("friend-request-accepted", {
                    from: { _id: sender._id, displayName: sender.displayName },
                    newFriend: toFriendItem(newFriend, sender),
                    message: `${sender.displayName} đã chấp nhận lời mời kết bạn của bạn.`
                });
            }
            emitToUser(sender._id.toString(), "friend-request-resolved", {
                requestId: reverseRequest._id.toString(),
                action: "accepted",
                newFriend: toFriendItem(newFriend, receiver)
            });
            return res.status(201).json({ message: `Bạn và ${receiver.displayName} hiện đã là bạn bè.` });
        }
        const friendRequest = new FriendRequest({
            from: sender._id,
            to: receiver._id,
            message: normalizedMessage || undefined,
            status: 'pending'
        });
        await friendRequest.save();
        invalidateFriendReadCache([sender._id, receiver._id]);
        await createNotification(receiver._id,
            "New Friend Request",
            `${sender.displayName} đã gửi cho bạn một lời mời kết bạn. ${normalizedMessage ? `"${normalizedMessage}"` : ""}`,
            `${process.env.FRONTEND_URL}/people?tab=requests`,
            { actorId: sender._id });
        const populatedRequestDoc = await FriendRequest.findById(friendRequest._id)
            .populate('from', PROFILE_USER_SELECT);
        const populatedRequest = populatedRequestDoc?.toObject?.() || populatedRequestDoc;
        if (populatedRequest?.from) {
            populatedRequest.from = sanitizeProfileForViewer(populatedRequest.from, receiver._id, false);
        }
        await emitSentRequestUpdated(sender._id, friendRequest._id);
        const receiverSocketId = getReceiverSocketId(receiver._id.toString());
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("new-friend-request", {
                friendRequest: populatedRequest
            });
        }
        return res.status(201).json({ message: `Đã gửi lời mời kết bạn đến ${receiver.displayName} thành công.` });
    } catch (error) {
        console.error('Send friend request error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
}

export async function acceptFriendRequest(req, res) {
    try {
        const receiver = req.user;
        const { requestId } = req.params;
        const friendRequest = await FriendRequest.findById(requestId);
        if (!friendRequest) {
            return res.status(404).json({ message: 'Friend request not found.' });
        }
        if (friendRequest.to.toString() !== receiver._id.toString()) {
            return res.status(403).json({ message: 'You are not authorized to accept this friend request.' });
        }
        if (friendRequest.status !== 'pending') {
            return res.status(400).json({ message: 'This friend request is no longer pending.' });
        }
        const sender = await User.findById(friendRequest.from);
        if (sender?.lock?.isLocked) {
            return res.status(423).json({ message: 'Không thể chấp nhận lời mời từ tài khoản đã bị khóa.' });
        }
        if (await checkFriendLimit(receiver._id, sender._id)) {
            return res.status(400).json({ message: FRIEND_LIMIT_MESSAGE });
        }
        const newFriend = new Friend({
            userA: receiver._id,
            userB: sender._id
        });
        await newFriend.save();
        friendRequest.status = 'accepted';
        await friendRequest.save();
        invalidateFriendReadCache([receiver._id, sender._id]);
        await createNotification(sender._id,
            "Friend Request Accepted",
            `${receiver.displayName} đã chấp nhận lời mời kết bạn của bạn.`,
            `${process.env.FRONTEND_URL}/people?tab=friends`,
            { actorId: receiver._id });
        const senderSocketId = getReceiverSocketId(sender._id.toString());
        if (senderSocketId) {
            io.to(senderSocketId).emit("friend-request-accepted", {
                from: { _id: receiver._id, displayName: receiver.displayName, avatarUrl: receiver.avatarUrl },
                message: `${receiver.displayName} đã chấp nhận lời mời kết bạn của bạn!`,
                newFriend: {
                    _id: newFriend._id,
                    friendId: receiver._id,
                    displayName: receiver.displayName,
                    avatarUrl: receiver.avatarUrl,
                    createdAt: newFriend.createdAt
                }
            });
        }
        emitToUser(receiver._id.toString(), "friend-request-resolved", {
            requestId,
            action: "accepted",
            newFriend: {
                _id: newFriend._id,
                friendId: sender._id,
                displayName: sender.displayName,
                avatarUrl: sender.avatarUrl,
                createdAt: newFriend.createdAt
            }
        });

        await emitOnlineUsers({ broadcast: true });

        return res.status(200).json({
            message: `Bạn đã chấp nhận lời mời kết bạn từ ${sender.displayName}.`,
            newFriend: {
                _id: newFriend._id,
                friendId: sender._id,
                displayName: sender.displayName,
                avatarUrl: sender.avatarUrl,
                createdAt: newFriend.createdAt
            }
        });
    } catch (error) {
        console.error('Accept friend request error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
}

export async function rejectFriendRequest(req, res) {
    try {
        const receiver = req.user;
        const { requestId } = req.params;
        const friendRequest = await FriendRequest.findById(requestId);
        if (!friendRequest) {
            return res.status(404).json({ message: 'Friend request not found.' });
        }
        if (friendRequest.to.toString() !== receiver._id.toString()) {
            return res.status(403).json({ message: 'You are not authorized to reject this friend request.' });
        }
        if (friendRequest.status !== 'pending') {
            return res.status(400).json({ message: 'This friend request is no longer pending.' });
        }
        const sender = await User.findById(friendRequest.from);
        friendRequest.status = 'rejected';
        await friendRequest.save();
        invalidateFriendReadCache([receiver._id, sender?._id]);
        emitToUser(receiver._id.toString(), "friend-request-resolved", {
            requestId,
            action: "rejected"
        });
        const senderSocketId = getReceiverSocketId(sender._id.toString());
        if (senderSocketId) {
            io.to(senderSocketId).emit("friend-request-rejected", {
                from: { _id: receiver._id, displayName: receiver.displayName },
                message: `${receiver.displayName} đã từ chối lời mời kết bạn của bạn.`
            });
        }
        return res.status(200).json({ message: `Bạn đã từ chối lời mời kết bạn từ ${sender.displayName}.` });
    } catch (error) {
        console.error('Reject friend request error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
}

export async function resendFriendRequest(req, res) {
    try {
        const sender = req.user;
        const { requestId } = req.params;
        const friendRequest = await FriendRequest.findById(requestId);
        if (!friendRequest) {
            return res.status(404).json({ message: 'Friend request not found.' });
        }
        if (friendRequest.to.toString() !== sender._id.toString()) {
            return res.status(403).json({ message: 'You are not authorized to resend this friend request.' });
        }
        if (friendRequest.status !== 'rejected') {
            return res.status(400).json({ message: 'This friend request is no longer rejected.' });
        }
        if (await hasReachedPendingRequestLimit(sender._id)) {
            return res.status(400).json({ message: PENDING_REQUEST_LIMIT_MESSAGE });
        }
        const receiver = await User.findById(friendRequest.to);
        friendRequest.status = 'pending';
        await friendRequest.save();
        invalidateFriendReadCache([sender._id, receiver?._id]);
        await emitSentRequestUpdated(sender._id, friendRequest._id);
        await createNotification(receiver._id,
            "Friend Request Resent",
            `${sender.displayName} đã gửi lại lời mời kết bạn.`,
            `${process.env.FRONTEND_URL}/people?tab=requests`,
            { actorId: sender._id });
        return res.status(200).json({ message: `Đã gửi lại lời mời kết bạn đến ${receiver.displayName}.` });
    } catch (error) {
        console.error('Accept friend request error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
}

export async function cancelFriendRequest(req, res) {
    try {
        const sender = req.user;
        const { requestId } = req.params;
        const friendRequest = await FriendRequest.findById(requestId);
        if (!friendRequest) {
            return res.status(404).json({ message: 'Friend request not found.' });
        }
        if (friendRequest.from.toString() !== sender._id.toString()) {
            return res.status(403).json({ message: 'You are not authorized to cancel this friend request.' });
        }
        if (friendRequest.status !== 'pending') {
            return res.status(400).json({ message: 'This friend request is no longer pending.' });
        }
        const receiverId = friendRequest.to.toString();
        await FriendRequest.deleteOne({ _id: requestId });
        invalidateFriendReadCache([sender._id, receiverId]);
        emitToUser(sender._id.toString(), "friend-request-sent-cancelled", {
            requestId
        });
        const receiverSocketId = getReceiverSocketId(receiverId);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("friend-request-cancelled", {
                requestId
            });
        }
        return res.status(200).json({ message: 'Đã hủy lời mời kết bạn thành công.' });
    } catch (error) {
        console.error('Cancel friend request error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
}

export async function getFriendRequests(req, res) {
    try {
        const user = req.user;
        const friendRequests = await FriendRequest.find({ to: user._id, status: 'pending' })
            .populate('from', PROFILE_USER_SELECT)
            .sort({ createdAt: -1 })
            .lean();
        if (friendRequests.length === 0) {
            return res.status(200).json({ friendRequests: [] });
        }
        return res.status(200).json({
            friendRequests: friendRequests.map((request) => ({
                ...request,
                from: sanitizeProfileForViewer(request.from, user._id, false),
            })),
        });
    } catch (error) {
        console.error('Get friend requests error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
}

export async function unfriendUser(req, res) {
    try {
        const user = req.user;
        const { friendId } = req.params;
        const friend = await User.findById(friendId);
        if (!friend) {
            return res.status(404).json({ message: 'User not found.' });
        }
        if (friend.lock?.isLocked) {
            return res.status(423).json({ message: 'Không thể cập nhật biệt danh cho tài khoản đã bị khóa.' });
        }
        const friendship = await Friend.findOne({
            $or: [
                { userA: user._id, userB: friend._id },
                { userA: friend._id, userB: user._id }
            ]
        });
        if (!friendship) {
            return res.status(404).json({ message: 'Friendship not found.' });
        }
        const friendRequest = await FriendRequest.findOne({
            $or: [
                { from: user._id, to: friend._id },
                { from: friend._id, to: user._id }
            ]
        });
        if (friendRequest) {
            await FriendRequest.deleteOne({ _id: friendRequest._id });
        }
        await Friend.deleteOne({ _id: friendship._id });
        invalidateFriendReadCache([user._id, friend._id]);

        emitToUser(user._id.toString(), "unfriended", {
            friendId
        });

        const friendSocketId = getReceiverSocketId(friendId);
        if (friendSocketId) {
            io.to(friendSocketId).emit("unfriended", {
                friendId: user._id
            });
        }

        await emitOnlineUsers({ broadcast: true });

        return res.status(200).json({ message: `Bạn đã hủy kết bạn với ${friend.displayName}.` });
    } catch (error) {
        console.error('Unfriend user error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
}

export async function blockUser(req, res) {
    try {
        const user = req.user;
        const { userIdBlocked } = req.params;
        const userBlocked = await User.findById(userIdBlocked);
        if (!userBlocked) {
            return res.status(404).json({ message: 'User not found.' });
        }
        const alreadyBlocked = await BlockUser.findOne({ from: user._id, to: userBlocked._id });
        if (alreadyBlocked) {
            return res.status(400).json({ message: `${userBlocked.displayName} is already blocked by you.` });
        }
        const friendship = await Friend.findOne({
            $or: [
                { userA: user._id, userB: userBlocked._id },
                { userA: userBlocked._id, userB: user._id }
            ]
        });
        if (friendship) {
            await Friend.deleteOne({ _id: friendship._id });
        }
        const friendRequest = await FriendRequest.findOne({
            $or: [
                { from: user._id, to: userBlocked._id },
                { from: userBlocked._id, to: user._id }
            ]
        });
        if (friendRequest) {
            await FriendRequest.deleteOne({ _id: friendRequest._id });
        }
        const blockEntry = new BlockUser({
            from: user._id,
            to: userBlocked._id
        });
        await blockEntry.save();
        invalidateFriendReadCache([user._id, userBlocked._id]);

        emitToUser(user._id.toString(), "user-blocked-self", {
            blockedUser: {
                _id: userBlocked._id,
                displayName: userBlocked.displayName,
                email: userBlocked.email,
                avatarUrl: userBlocked.avatarUrl,
                blockedAt: blockEntry.createdAt
            }
        });

        const receiverSocketId = getReceiverSocketId(userIdBlocked);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("user-blocked", {
                blockedBy: user._id.toString()
            });
        }

        await emitOnlineUsers({ broadcast: true });

        return res.status(200).json({
            message: `Bạn đã chặn ${userBlocked.displayName}.`,
            blockedUser: {
                _id: userBlocked._id,
                displayName: userBlocked.displayName,
                email: userBlocked.email,
                avatarUrl: userBlocked.avatarUrl,
                blockedAt: blockEntry.createdAt
            }
        });
    } catch (error) {
        console.error('Block user error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
}

export async function unblockUser(req, res) {
    try {
        const user = req.user;
        const { userIdUnblocked } = req.params;
        const userUnblocked = await User.findById(userIdUnblocked);
        if (!userUnblocked) {
            return res.status(404).json({ message: 'User not found.' });
        }
        const blockEntry = await BlockUser.findOne({ from: user._id, to: userUnblocked._id });
        if (!blockEntry) {
            return res.status(400).json({ message: `${userUnblocked.displayName} is not blocked by you.` });
        }
        await BlockUser.deleteOne({ _id: blockEntry._id });
        invalidateFriendReadCache([user._id, userUnblocked._id]);

        emitToUser(user._id.toString(), "user-unblocked-self", {
            userId: userIdUnblocked
        });

        const receiverSocketId = getReceiverSocketId(userIdUnblocked);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("user-unblocked", {
                unblockedBy: user._id.toString()
            });
        }

        await emitOnlineUsers({ broadcast: true });

        return res.status(200).json({ message: `Bạn đã bỏ chặn ${userUnblocked.displayName}.` });
    } catch (error) {
        console.error('Unblock user error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
}

export async function getAllFriends(req, res) {
    let pendingCache = null;
    try {
        const user = req.user;
        const cacheKey = buildReadCacheKey('friends:list', [user._id]);
        const cachedPayload = getCachedJson(cacheKey);
        if (cachedPayload) {
            return res.status(200).json(cachedPayload);
        }
        const pendingPayload = getPendingJson(cacheKey);
        if (pendingPayload) {
            return res.status(200).json(await pendingPayload);
        }
        pendingCache = createPendingJson(cacheKey);

        const friends = await Friend.find({
            $or: [
                { userA: user._id },
                { userB: user._id }
            ]
        }).populate([
            { path: 'userA', select: PROFILE_USER_SELECT },
            { path: 'userB', select: PROFILE_USER_SELECT }
        ]).lean();
        let listedFriends = friends.map(friend => {
            const isUserA = friend.userA._id.toString() === user._id.toString();
            const friendUser = sanitizeProfileForViewer(isUserA ? friend.userB : friend.userA, user._id, true);
            return {
                _id: friend._id,
                friendId: friendUser._id,
                displayName: friendUser.displayName,
                avatarUrl: friendUser.avatarUrl,
                email: friendUser.email,
                bio: friendUser.bio,
                phone: friendUser.phone,
                nickname: isUserA ? friend.nicknameB : friend.nicknameA,
                createdAt: friend.createdAt,
                updatedAt: friend.updatedAt
            };
        });
        const friendIds = listedFriends.map((friend) => friend.friendId?.toString()).filter(Boolean);
        const socketOnlineUserIds = await getOnlineUserIdsForUsers(friendIds);
        const presences = await getVisiblePresencesForUsers(friendIds, {
            socketOnlineUserIds,
            viewerId: user._id,
        });
        const presenceByUserId = new Map(presences.map((presence) => [presence.userId, presence]));
        listedFriends = listedFriends.map((friend) => ({
            ...friend,
            presence: presenceByUserId.get(friend.friendId?.toString()) || null,
        }));
        const payload = { listedFriends };
        setCachedJson(cacheKey, payload, FRIENDS_LIST_CACHE_TTL_MS);
        pendingCache.resolve(payload);
        return res.status(200).json(payload);
    } catch (error) {
        pendingCache?.reject(error);
        console.error('Get all friends error:', error);
        return res.status(500).json({ message: 'Server error' });
    } finally {
        pendingCache?.clear();
    }
}

export async function getFriendSuggestions(req, res) {
    let pendingCache = null;
    try {
        const user = req.user;
        const userId = user._id;
        const currentUserId = userId.toString();
        const limit = Math.min(
            Math.max(Number.parseInt(req.query.limit, 10) || DEFAULT_SUGGESTION_LIMIT, 1),
            MAX_SUGGESTION_LIMIT
        );
        const cacheKey = buildReadCacheKey('friends:suggestions', [currentUserId, limit]);
        const cachedPayload = getCachedJson(cacheKey);
        if (cachedPayload) {
            return res.status(200).json(cachedPayload);
        }
        const pendingPayload = getPendingJson(cacheKey);
        if (pendingPayload) {
            return res.status(200).json(await pendingPayload);
        }
        pendingCache = createPendingJson(cacheKey);

        const [friendships, relatedRequests, blockEntries, myGroups] = await Promise.all([
            Friend.find({
                $or: [
                    { userA: userId },
                    { userB: userId }
                ]
            }).select('userA userB').lean(),
            FriendRequest.find({
                $or: [
                    { from: userId },
                    { to: userId }
                ]
            }).select('from to').lean(),
            BlockUser.find({
                $or: [
                    { from: userId },
                    { to: userId }
                ]
            }).select('from to').lean(),
            Conversation.find({
                type: 'group',
                disbanded: { $ne: true },
                'participants.userId': userId
            }).select('group.name group.avatarUrl participants.userId participants.userInfo lastMessage.createdAt updatedAt createdAt').lean()
        ]);

        const friendIds = friendships.map((friendship) => {
            const userA = getIdString(friendship.userA);
            const userB = getIdString(friendship.userB);
            return userA === currentUserId ? userB : userA;
        }).filter(Boolean);

        const friendIdSet = new Set(friendIds);
        const excludedIds = new Set([currentUserId, ...friendIds]);

        relatedRequests.forEach((request) => {
            excludedIds.add(getIdString(request.from));
            excludedIds.add(getIdString(request.to));
        });

        blockEntries.forEach((entry) => {
            excludedIds.add(getIdString(entry.from));
            excludedIds.add(getIdString(entry.to));
        });

        const candidateStats = new Map();
        const ensureCandidate = (candidateId) => {
            const id = candidateId?.toString();
            if (!id || excludedIds.has(id)) return null;
            if (!candidateStats.has(id)) {
                candidateStats.set(id, {
                    userId: id,
                    mutualFriendIds: new Set(),
                    commonGroups: new Map(),
                    recentGroupActivityScore: 0,
                    sameEmailDomain: false,
                    fallbackNewUser: false,
                });
            }
            return candidateStats.get(id);
        };

        if (friendIds.length > 0) {
            const secondDegreeFriendships = await Friend.find({
                $or: [
                    { userA: { $in: friendIds } },
                    { userB: { $in: friendIds } }
                ]
            }).select('userA userB').lean();

            secondDegreeFriendships.forEach((friendship) => {
                const userA = getIdString(friendship.userA);
                const userB = getIdString(friendship.userB);

                if (friendIdSet.has(userA)) {
                    const candidate = ensureCandidate(userB);
                    candidate?.mutualFriendIds.add(userA);
                }
                if (friendIdSet.has(userB)) {
                    const candidate = ensureCandidate(userA);
                    candidate?.mutualFriendIds.add(userB);
                }
            });
        }

        myGroups.forEach((conversation) => {
            const groupId = getIdString(conversation._id);
            const participants = conversation.participants || [];
            const memberCount = participants.length;
            const groupInfo = {
                _id: groupId,
                name: getGroupName(conversation),
                avatarUrl: conversation.group?.avatarUrl,
                memberCount,
            };
            const activityScore = recencyScoreFromDate(conversation.lastMessage?.createdAt || conversation.updatedAt || conversation.createdAt);

            participants.forEach((participant) => {
                const participantId = getIdString(participant.userId);
                if (participantId === currentUserId) return;

                const candidate = ensureCandidate(participantId);
                if (!candidate) return;

                if (!candidate.commonGroups.has(groupId)) {
                    candidate.commonGroups.set(groupId, groupInfo);
                    candidate.recentGroupActivityScore += activityScore;
                }
            });
        });

        const currentDomain = normalizeEmailDomain(user.email);
        if (currentDomain) {
            const sameDomainUsers = await User.find({
                _id: { $nin: Array.from(excludedIds) },
                email: { $regex: new RegExp(`@${escapeRegex(currentDomain)}$`, 'i') },
                'lock.isLocked': { $ne: true },
                ...NON_ADMIN_USER_FILTER
            }).select('_id').sort({ createdAt: -1 }).limit(limit * 3).lean();

            sameDomainUsers.forEach((sameDomainUser) => {
                const candidate = ensureCandidate(getIdString(sameDomainUser._id));
                if (candidate) candidate.sameEmailDomain = true;
            });
        }

        if (candidateStats.size < limit) {
            const fallbackUsers = await User.find({
                _id: { $nin: Array.from(excludedIds) },
                'lock.isLocked': { $ne: true },
                ...NON_ADMIN_USER_FILTER
            }).select('_id').sort({ createdAt: -1 }).limit(limit * 3).lean();

            fallbackUsers.forEach((fallbackUser) => {
                const candidate = ensureCandidate(getIdString(fallbackUser._id));
                if (candidate) candidate.fallbackNewUser = true;
            });
        }

        const candidateIds = Array.from(candidateStats.keys());
        if (candidateIds.length === 0) {
            const payload = { suggestions: [] };
            setCachedJson(cacheKey, payload, FRIEND_SUGGESTIONS_CACHE_TTL_MS);
            pendingCache.resolve(payload);
            return res.status(200).json(payload);
        }

        const candidateUsers = await User.find({
            _id: { $in: candidateIds },
            'lock.isLocked': { $ne: true },
            ...NON_ADMIN_USER_FILTER
        }).select(`${PROFILE_USER_SELECT} createdAt`).lean();

        const rankedCandidates = candidateUsers.map((candidateUser) => {
            const candidateId = getIdString(candidateUser._id);
            const stats = candidateStats.get(candidateId);
            const commonGroups = Array.from(stats.commonGroups.values());
            let groupStrengthScore = 0;

            commonGroups.forEach((group) => {
                if (group.memberCount <= 10) groupStrengthScore += 4;
                else if (group.memberCount <= 25) groupStrengthScore += 2;
                else groupStrengthScore += 1;
            });

            const recentlyJoined = isRecentlyJoined(candidateUser.createdAt);
            const sameEmailDomain = Boolean(stats.sameEmailDomain || (
                currentDomain && normalizeEmailDomain(candidateUser.email) === currentDomain
            ));
            const score =
                stats.mutualFriendIds.size * 14 +
                commonGroups.length * 10 +
                groupStrengthScore +
                Math.min(stats.recentGroupActivityScore, 8) +
                (sameEmailDomain ? 4 : 0) +
                (recentlyJoined ? 2 : 0) +
                (stats.fallbackNewUser ? 1 : 0);

            return {
                user: candidateUser,
                stats: {
                    ...stats,
                    sameEmailDomain,
                    recentlyJoined,
                    commonGroups,
                },
                score,
            };
        }).sort((left, right) => {
            if (right.score !== left.score) return right.score - left.score;
            if (right.stats.mutualFriendIds.size !== left.stats.mutualFriendIds.size) {
                return right.stats.mutualFriendIds.size - left.stats.mutualFriendIds.size;
            }
            if (right.stats.commonGroups.length !== left.stats.commonGroups.length) {
                return right.stats.commonGroups.length - left.stats.commonGroups.length;
            }
            return new Date(right.user.createdAt).getTime() - new Date(left.user.createdAt).getTime();
        }).slice(0, limit);

        const mutualFriendIds = [
            ...new Set(rankedCandidates.flatMap(({ stats }) => Array.from(stats.mutualFriendIds)))
        ];
        const mutualFriendDocs = mutualFriendIds.length > 0
            ? await User.find({ _id: { $in: mutualFriendIds }, ...NON_ADMIN_USER_FILTER }).select('displayName avatarUrl lock').lean()
            : [];
        const mutualFriendById = new Map(mutualFriendDocs.map((friend) => [
            getIdString(friend._id),
            sanitizeProfileForViewer(friend, user._id, true),
        ]));

        const suggestions = rankedCandidates.map(({ user: candidateUser, stats, score }) => {
            const safeUser = sanitizeProfileForViewer(candidateUser, user._id, false);
            const mutualFriends = Array.from(stats.mutualFriendIds)
                .map((friendId) => mutualFriendById.get(friendId))
                .filter(Boolean)
                .slice(0, 5)
                .map((friend) => ({
                    _id: friend._id,
                    displayName: friend.displayName,
                    avatarUrl: friend.avatarUrl,
                }));

            return {
                _id: safeUser._id,
                displayName: safeUser.displayName,
                email: safeUser.email,
                avatarUrl: safeUser.avatarUrl,
                bio: safeUser.bio,
                phone: safeUser.phone,
                score,
                reasons: {
                    mutualFriendsCount: stats.mutualFriendIds.size,
                    mutualFriends,
                    commonGroupsCount: stats.commonGroups.length,
                    commonGroups: stats.commonGroups.slice(0, 5),
                    sameEmailDomain: stats.sameEmailDomain,
                    activeInCommonGroups: stats.recentGroupActivityScore > 0,
                    recentlyJoined: stats.recentlyJoined,
                }
            };
        });

        const payload = { suggestions };
        setCachedJson(cacheKey, payload, FRIEND_SUGGESTIONS_CACHE_TTL_MS);
        pendingCache.resolve(payload);
        return res.status(200).json(payload);
    } catch (error) {
        pendingCache?.reject(error);
        console.error('Get friend suggestions error:', error);
        return res.status(500).json({ message: 'Server error' });
    } finally {
        pendingCache?.clear();
    }
}

export async function getFriendRequestsSended(req, res) {
    try {
        const user = req.user;
        const friendRequests = await FriendRequest.find({ from: user._id, status: 'pending' })
            .populate('to', PROFILE_USER_SELECT)
            .sort({ createdAt: -1 })
            .lean();
        if (friendRequests.length === 0) {
            return res.status(200).json({ friendRequests: [] });
        }
        return res.status(200).json({
            friendRequests: friendRequests.map((request) => ({
                ...request,
                to: sanitizeProfileForViewer(request.to, user._id, false),
            })),
        });
    } catch (error) {
        console.error('Get sent friend requests error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
}

export async function getUserBlockedList(req, res) {
    try {
        const user = req.user;
        const [blockedUsers, blockedByEntries] = await Promise.all([
            BlockUser.find({ from: user._id }).populate('to', PROFILE_USER_SELECT),
            BlockUser.find({ to: user._id }).select('from').lean(),
        ]);
        const listedBlockedUsers = blockedUsers.map(entry => {
            const visibleUser = sanitizeProfileForViewer(entry.to, user._id, false);
            return {
                _id: visibleUser._id,
                displayName: visibleUser.displayName,
                email: visibleUser.email,
                avatarUrl: visibleUser.avatarUrl,
                profileVisibility: visibleUser.profileVisibility,
                profileVisibleToViewer: visibleUser.profileVisibleToViewer,
                blockedAt: entry.createdAt
            };
        });
        return res.status(200).json({
            blockedUsers: listedBlockedUsers,
            blockedBy: blockedByEntries.map(entry => entry.from.toString()),
        });
    } catch (error) {
        console.error('Get blocked users error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
}

export async function setFriendNickname(req, res) {
    try {
        const user = req.user;
        const { friendId } = req.params;
        const { nickname } = req.body;
        const nicknameError = checkFieldFormat('nickname', nickname);
        if (nicknameError) {
            return res.status(400).json({ message: nicknameError });
        }
        const friend = await User.findById(friendId);
        if (!friend) {
            return res.status(404).json({ message: 'User not found.' });
        }
        const friendship = await Friend.findOne({
            $or: [
                { userA: user._id, userB: friend._id },
                { userA: friend._id, userB: user._id }
            ]
        });
        if (!friendship) {
            return res.status(404).json({ message: 'Friendship not found.' });
        }
        const normalizedNickname = typeof nickname === 'string' ? nickname.trim() : '';
        const nicknamePayload = normalizedNickname || null;

        if (!normalizedNickname) {
            if (friendship.userA.toString() === user._id.toString()) {
                friendship.nicknameB = undefined;
            } else {
                friendship.nicknameA = undefined;
            }
            await friendship.save();
            invalidateFriendReadCache(user._id);
            await emitToUser(user._id.toString(), "friend-nickname-updated", {
                friendId: friend._id.toString(),
                nickname: null,
            });
            return res.status(200).json({
                message: `Nickname for ${friend.displayName} has been removed.`,
                friendId: friend._id,
                nickname: null,
            });
        }
        if (friendship.userA.toString() === user._id.toString()) {
            friendship.nicknameB = normalizedNickname;
        } else {
            friendship.nicknameA = normalizedNickname;
        }
        await friendship.save();
        invalidateFriendReadCache(user._id);
        await emitToUser(user._id.toString(), "friend-nickname-updated", {
            friendId: friend._id.toString(),
            nickname: nicknamePayload,
        });
        return res.status(200).json({
            message: `Nickname for ${friend.displayName} has been updated.`,
            friendId: friend._id,
            nickname: nicknamePayload,
        });
    } catch (error) {
        console.error('Set friend nickname error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
}
