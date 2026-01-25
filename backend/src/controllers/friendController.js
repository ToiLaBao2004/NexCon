import FriendRequest from "../models/friendRequestModel.js";
import User from '../models/userModel.js';
import Friend from '../models/friendModel.js';
import Notification from '../models/notificationModel.js';

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

export async function getFriendRequests(req, res) {
    try {
        const user = req.user;
        const friendRequests = await FriendRequest.find({ to: user._id, status: 'pending' })
            .populate('from', 'displayName email avatarUrl');
        return res.status(200).json({ friendRequests });
    } catch (error) {
        console.error('Get friend requests error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
}