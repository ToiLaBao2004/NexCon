import FriendRequest from "../models/friendRequestModel.js";
import User from '../models/userModel.js';
import Friend from '../models/friendModel.js';
import Notification from '../models/notificationModel.js';
import BlockUser from "../models/blockUserModel.js";
import { io, getReceiverSocketId, emitToUser } from "../socket/index.js";
import { createNotification } from "../services/notificationServices.js";
import { checkFieldFormat } from "../utils/fieldFormat.js";

const toFriendItem = (friendship, user) => ({
    _id: friendship._id,
    friendId: user._id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    createdAt: friendship.createdAt
});

const MAX_FRIENDS = 500;
const FRIEND_LIMIT_MESSAGE = `Mỗi người chỉ có thể có tối đa ${MAX_FRIENDS} bạn bè.`;
const MAX_PENDING_SENT_REQUESTS = 100;
const PENDING_REQUEST_LIMIT_MESSAGE = `Bạn chỉ có thể có tối đa ${MAX_PENDING_SENT_REQUESTS} lời mời kết bạn đang chờ xử lý.`;

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
        .populate('to', 'displayName email avatarUrl bio phone');

    if (friendRequest) {
        emitToUser(senderId.toString(), "friend-request-sent-updated", {
            friendRequest
        });
    }
}

export async function sendFriendRequest(req, res) {
    try {
        const sender = req.user;
        const { email, message } = req.body;
        if (!email) {
            return res.status(400).json({ message: "Email is required." });
        }
        const receiver = await User.findOne({ email: email.toLowerCase() }).select('_id displayName email avatarUrl').lean();
        if (!receiver) {
            return res.status(404).json({ message: "User with this email not found." });
        }
        const isBlocked = await BlockUser.findOne({ from: receiver._id, to: sender._id });
        if (isBlocked) {
            return res.status(403).json({ message: "You cannot send a friend request to this user." });
        }
        const blockedBySender = await BlockUser.findOne({ from: sender._id, to: receiver._id });
        if (blockedBySender) {
            await BlockUser.deleteOne({ _id: blockedBySender._id });
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
            rejectedRequest.message = message ? message.trim().slice(0, 300) : undefined;
            await rejectedRequest.save();
            await createNotification(receiver._id,
                "Friend Request Resent",
                `${sender.displayName} đã gửi cho bạn một lời mời kết bạn. ${message ? `"${message}"` : ""}`,
                `${process.env.FRONTEND_URL}/people?tab=requests`);
            const populatedRequest = await FriendRequest.findById(rejectedRequest._id)
                .populate('from', 'displayName email avatarUrl');
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
            await createNotification(receiver._id,
                "Friend Request Accepted",
                `${sender.displayName} đã chấp nhận lời mời kết bạn của bạn.`,
                `${process.env.FRONTEND_URL}/people?tab=friends`);
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
            message: message ? message.trim().slice(0, 300) : undefined,
            status: 'pending'
        });
        await friendRequest.save();
        await createNotification(receiver._id,
            "New Friend Request",
            `${sender.displayName} đã gửi cho bạn một lời mời kết bạn. ${message ? `"${message}"` : ""}`,
            `${process.env.FRONTEND_URL}/people?tab=requests`);
        const populatedRequest = await FriendRequest.findById(friendRequest._id)
            .populate('from', 'displayName email avatarUrl bio phone');
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
        await createNotification(sender._id,
            "Friend Request Accepted",
            `${receiver.displayName} đã chấp nhận lời mời kết bạn của bạn.`,
            `${process.env.FRONTEND_URL}/people?tab=friends`);
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
        await emitSentRequestUpdated(sender._id, friendRequest._id);
        await createNotification(receiver._id,
            "Friend Request Resent",
            `${sender.displayName} đã gửi lại lời mời kết bạn.`,
            `${process.env.FRONTEND_URL}/people?tab=requests`);
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
            .populate('from', 'displayName email avatarUrl bio phone')
            .sort({ createdAt: -1 });
        if (friendRequests.length === 0) {
            return res.status(200).json({ friendRequests: [] });
        }
        return res.status(200).json({ friendRequests });
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

        emitToUser(user._id.toString(), "unfriended", {
            friendId
        });

        const friendSocketId = getReceiverSocketId(friendId);
        if (friendSocketId) {
            io.to(friendSocketId).emit("unfriended", {
                friendId: user._id
            });
        }

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

        emitToUser(user._id.toString(), "user-unblocked-self", {
            userId: userIdUnblocked
        });

        const receiverSocketId = getReceiverSocketId(userIdUnblocked);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("user-unblocked", {
                unblockedBy: user._id.toString()
            });
        }

        return res.status(200).json({ message: `Bạn đã bỏ chặn ${userUnblocked.displayName}.` });
    } catch (error) {
        console.error('Unblock user error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
}

export async function getAllFriends(req, res) {
    try {
        const user = req.user;
        const friends = await Friend.find({
            $or: [
                { userA: user._id },
                { userB: user._id }
            ]
        }).populate([
            { path: 'userA', select: 'displayName avatarUrl email bio phone' },
            { path: 'userB', select: 'displayName avatarUrl email bio phone' }
        ]).lean();
        const listedFriends = friends.map(friend => {
            const isUserA = friend.userA._id.toString() === user._id.toString();
            const friendUser = isUserA ? friend.userB : friend.userA;
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
        return res.status(200).json({ listedFriends });
    } catch (error) {
        console.error('Get all friends error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
}

export async function getFriendRequestsSended(req, res) {
    try {
        const user = req.user;
        const friendRequests = await FriendRequest.find({ from: user._id, status: 'pending' })
            .populate('to', 'displayName email avatarUrl bio phone')
            .sort({ createdAt: -1 });
        if (friendRequests.length === 0) {
            return res.status(200).json({ friendRequests: [] });
        }
        return res.status(200).json({ friendRequests });
    } catch (error) {
        console.error('Get sent friend requests error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
}

export async function getUserBlockedList(req, res) {
    try {
        const user = req.user;
        const blockedUsers = await BlockUser.find({ from: user._id })
            .populate('to', 'displayName email avatarUrl');
        if (blockedUsers.length === 0) {
            return res.status(200).json({ blockedUsers: [] });
        }
        const listedBlockedUsers = blockedUsers.map(entry => ({
            _id: entry.to._id,
            displayName: entry.to.displayName,
            email: entry.to.email,
            avatarUrl: entry.to.avatarUrl,
            blockedAt: entry.createdAt
        }));
        return res.status(200).json({ blockedUsers: listedBlockedUsers });
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
        if (nickname === undefined || nickname.trim() === "") {
            if (friendship.userA.toString() === user._id.toString()) {
                friendship.nicknameB = undefined;
            } else {
                friendship.nicknameA = undefined;
            }
            await friendship.save();
            return res.status(200).json({ message: `Nickname for ${friend.displayName} has been removed.` });
        }
        if (friendship.userA.toString() === user._id.toString()) {
            friendship.nicknameB = nickname ? nickname.trim() : undefined;
        } else {
            friendship.nicknameA = nickname ? nickname.trim() : undefined;
        }
        await friendship.save();
        return res.status(200).json({ message: `Nickname for ${friend.displayName} has been updated.` });
    } catch (error) {
        console.error('Set friend nickname error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
}
