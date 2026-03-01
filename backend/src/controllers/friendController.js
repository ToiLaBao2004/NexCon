import FriendRequest from "../models/friendRequestModel.js";
import User from '../models/userModel.js';
import Friend from '../models/friendModel.js';
import Notification from '../models/notificationModel.js';
import BlockUser from "../models/blockUserModel.js";

export async function sendFriendRequest(req, res) {
    try {
        const sender = req.user;
        const { email, message } = req.body;
        if (!email) {
            return res.status(400).json({ message: "Email is required." });
        }
        const receiver = await User.findOne({ email: email.toLowerCase() }).select('_id displayName').lean();
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
        const existingRequest = await FriendRequest.findOne({
            from: sender._id,
            to: receiver._id,
            status: 'pending'
        });
        if (existingRequest) {
            return res.status(400).json({ message: 'You already sent a friend request to this user.' });
        }
        const reverseRequest = await FriendRequest.findOne({
            from: receiver._id,
            to: sender._id,
            status: 'pending'
        });
        if (reverseRequest) {
            reverseRequest.status = 'accepted';
            const newFriend = new Friend({
                userA: receiver._id,
                userB: sender._id
            });
            await newFriend.save();
            const notification = new Notification({
                userId: receiver._id,
                title: "Friend Request Accepted",
                content: `${sender.displayName} accepted your friend request.`,
                linkUrl: `${process.env.FRONTEND_URL}/friends`,
                isRead: false
            });
            await notification.save();
            return res.status(201).json({ message: `You and ${receiver.displayName} are now friends.` });
        }
        const friendRequest = new FriendRequest({
            from: sender._id,
            to: receiver._id,
            message: message ? message.trim().slice(0, 300) : undefined,
            status: 'pending'
        });
        await friendRequest.save();
        const notification = new Notification({
            userId: receiver._id,
            title: "New Friend Request",
            content: `${sender.displayName} has sent you a friend request. ${message ? `"${message}"` : ""}`,
            linkUrl: `${process.env.FRONTEND_URL}/friends/requests`,
            isRead: false
        });
        await notification.save();
        return res.status(201).json({ message: `You sent a friend request to ${receiver.displayName} successfully.` });
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
        const newFriend = new Friend({
            userA: receiver._id,
            userB: sender._id
        });
        await newFriend.save();
        friendRequest.status = 'accepted';
        await friendRequest.save();
        const notification = new Notification({
            userId: sender._id,
            title: "Friend Request Accepted",
            content: `${receiver.displayName} accepted your friend request.`,
            linkUrl: `${process.env.FRONTEND_URL}/friends`,
            isRead: false
        });
        await notification.save();
        return res.status(200).json({ message: `You accepted the friend request from ${sender.displayName}.` });
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
        return res.status(200).json({ message: `You rejected the friend request from ${sender.displayName}.` });
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
        const receiver = await User.findById(friendRequest.to);
        friendRequest.status = 'pending';
        await friendRequest.save();
        const notification = new Notification({
            userId: receiver._id,
            title: "Friend Request Resent",
            content: `${sender.displayName} resent you friend request.`,
            linkUrl: `${process.env.FRONTEND_URL}/friends/requests`,
            isRead: false
        });
        await notification.save();
        return res.status(200).json({ message: `You resent the friend request to ${receiver.displayName}.` });
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
        await FriendRequest.deleteOne({ _id: requestId });
        return res.status(200).json({ message: 'Friend request canceled successfully.' });
    } catch (error) {
        console.error('Cancel friend request error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
}

export async function getFriendRequests(req, res) {
    try {
        const user = req.user;
        const friendRequests = await FriendRequest.find({ to: user._id, status: 'pending' })
            .populate('from', 'displayName email avatarUrl');
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
        return res.status(200).json({ message: `You unfriended ${friend.displayName}.` });
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
        return res.status(200).json({ message: `You have blocked ${userBlocked.displayName}.` });
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
        return res.status(200).json({ message: `You have unblocked ${userUnblocked.displayName}.` });
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
            { path: 'userA', select: 'displayName avatarUrl' },
            { path: 'userB', select: 'displayName avatarUrl' }
        ]).lean();
        const listedFriends = friends.map(friend => {
            const isUserA = friend.userA._id.toString() === user._id.toString();
            return {
                _id: friend._id,
                friendId: isUserA ? friend.userB._id : friend.userA._id,
                displayName: isUserA ? friend.userB.displayName : friend.userA.displayName,
                avatarUrl: isUserA ? friend.userB.avatarUrl : friend.userA.avatarUrl,
                nickname: isUserA ? friend.nicknameA : friend.nicknameB,
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
            .populate('to', 'displayName email avatarUrl');
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
            friendship.nicknameB = nickname ? nickname.trim().slice(0, 50) : undefined;
        } else {
            friendship.nicknameA = nickname ? nickname.trim().slice(0, 50) : undefined;
        }
        await friendship.save();
        return res.status(200).json({ message: `Nickname for ${friend.displayName} has been updated.` });
    } catch (error) {
        console.error('Set friend nickname error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
}