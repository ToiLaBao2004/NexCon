import Conversation from '../models/conversationModel.js';
import Message from '../models/messageModel.js';
import Friend from '../models/friendModel.js';
import { io, getReceiverSocketId } from '../socket/index.js';

export async function createConversation(req, res) {
	try {
		const { type, name, memberIds } = req.body;
		const userId = req.user._id;
		if (!type || (type === 'group' && (!name || name.trim() === '')) ||
			!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
			return res.status(400).json({ message: 'Group name and members are required.' });
		}
		let conversation;
		if (type === 'direct') {
			const participantId = memberIds[0];
			conversation = await Conversation.findOne({ type: 'direct', 'participants.userId': { $all: [userId, participantId] } });
			if (!conversation) {
				conversation = new Conversation({
					type: 'direct',
					participants: [
						{ userId: userId, joinedAt: new Date() },
						{ userId: participantId, joinedAt: new Date() }
					]
				});
				conversation = await Conversation.create(conversation);
			}
		}
		if (type === 'group') {
			const participants = memberIds.map(id => ({ userId: id, joinedAt: new Date() }));
			participants.push({ userId: userId, joinedAt: new Date() });
			conversation = new Conversation({
				type: 'group',
				group: {
					name: name,
					createdBy: userId,
					admins: [userId]
				},
				participants: participants
			});
			conversation = await Conversation.create(conversation);
		}
		if (!conversation) {
			return res.status(400).json({ message: 'Failed to create conversation.' });
		}
		await conversation.populate([
			{ path: 'participants.userId', select: 'displayName avatarUrl email bio phone' },
			{ path: 'seenBy', select: 'displayName avatarUrl' },
			{ path: 'lastMessage.senderId', select: 'displayName avatarUrl' }
		]);

		conversation.participants.forEach(p => {
			const receiverSocketId = getReceiverSocketId(p.userId._id.toString());
			if (receiverSocketId) {
				io.to(receiverSocketId).emit("new-conversation", { conversation });
			}
		});

		res.status(201).json({ conversation });
	} catch (error) {
		console.error('Error creating conversation:', error);
		res.status(500).json({ message: 'Internal server error' });
	}
}

export async function getConversations(req, res) {
	try {
		const myId = req.user._id.toString();

		const conversations = await Conversation.find({ "participants.userId": myId })
			.sort({ "lastMessage.createdAt": -1, updatedAt: -1 })
			.populate("participants.userId", "displayName avatarUrl email bio phone")
			.populate("lastMessage.senderId", "displayName avatarUrl")
			.populate("seenBy", "displayName avatarUrl")
			.lean();

		const allOtherIds = [
			...new Set(
				conversations
					.flatMap((c) => c.participants.map((p) => p.userId?._id?.toString()))
					.filter((id) => id && id !== myId)
			),
		];

		const nickMap = new Map();

		if (allOtherIds.length) {
			const friends = await Friend.find({
				$or: [
					{ userA: myId, userB: { $in: allOtherIds } },
					{ userB: myId, userA: { $in: allOtherIds } },
				],
			})
				.select("userA userB nicknameA nicknameB")
				.lean();

			for (const f of friends) {
				const a = f.userA.toString();
				const b = f.userB.toString();

				let otherId, nick;

				if (a === myId) {
					otherId = b;
					nick = f.nicknameB;
				} else if (b === myId) {
					otherId = a;
					nick = f.nicknameA;
				}

				if (otherId && nick != null) {
					nickMap.set(otherId, nick);
				}
			}
		}

		const formatted = conversations.map((c) => ({
			...c,
			participants: c.participants.map((p) => {
				const pid = p.userId?._id?.toString();
				const nickname = pid && pid !== myId ? nickMap.get(pid) || null : null;

				return {
					...p,
					userId: {
						...p.userId,
						nickname,
					},
				};
			}),
			unreadCounts: c.unreadCounts || {},
		}));

		return res.status(200).json({ conversations: formatted });
	} catch (error) {
		console.error("Error occurred while fetching conversations", error);
		return res.status(500).json({ message: "Internal server error" });
	}
}

export async function getMessages(req, res) {
	try {
		const { conversationId } = req.params;
		const { limit = 50, cursor } = req.query;
		const query = { conversationId };
		if (cursor) {
			query.createdAt = { $lt: new Date(cursor) }
		}

		const pinnedMessages = await Message.find({
			conversationId: query.conversationId,
			isPinned: true,
		})
			.sort({ pinnedAt: -1, createdAt: -1 })
			.populate('senderId', 'displayName avatarUrl')
			.populate({
				path: 'replyTo',
				select: '_id senderId type content fileName isRecalled',
				populate: { path: 'senderId', select: 'displayName' },
			})
			.lean();

		let messages = await Message.find(query)
			.sort({ createdAt: -1 })
			.limit(Number(limit) + 1)
			.populate({
				path: 'replyTo',
				select: '_id senderId type content fileName isRecalled',
				populate: { path: 'senderId', select: 'displayName' },
			});

		let nextCursor = null;

		if (messages.length > Number(limit)) {
			const nextMessage = messages[messages.length - 1];
			nextCursor = nextMessage.createdAt.toISOString();
			messages.pop();
		}

		messages = messages.reverse();

		return res.status(200).json({
			messages,
			nextCursor,
			pinnedMessages,
		});

	} catch (error) {
		console.error("Error occurred while fetching messages", error);
		return res.status(500).json({ message: "Internal server error" });
	}
}

export async function getUserConversationsForSocketIO(userId) {
	try {
		const conversations = await Conversation.find({ "participants.userId": userId },
			{ _id: 1 }
		);
		return conversations.map((c) => c._id.toString());
	} catch (error) {
		console.error("An error occurred while fetching conversations: ", error);
		return [];
	}
}

export async function markAsSeen(req, res) {
	try {
		const { conversationId } = req.params;
		const userId = req.user._id.toString();
		const conversation = await Conversation.findById(conversationId).lean();
		if (!conversation) {
			return res.status(404).json({ message: "Conversation not found" });
		}
		const last = conversation.lastMessage;
		if (!last) {
			return res.status(200).json({ message: "No messages in conversation" });
		}

		if (last.senderId.toString() === userId) {
			return res.status(200).json({ message: "Cannot mark own message as seen" });
		}

		const updated = await Conversation.findByIdAndUpdate(conversationId,
			{
				$addToSet: { seenBy: userId },
				$set: { [`unreadCounts.${userId}`]: 0 },

			}, { new: true }
		);

		io.to(conversationId).emit("read-message", {
			conversationId: conversationId,
			seenBy: updated.seenBy,
			lastMessage: {
				_id: updated.lastMessage._id,
				content: updated.lastMessage.content,
				createdAt: updated.lastMessage.createdAt,
				senderId: updated.lastMessage.senderId,
			}
		});

		return res.status(200).json({
			message: "Conversation marked as seen",
			seenBy: updated?.seenBy,
			myunreadCount: updated?.unreadCounts[userId] || 0,
		});

	} catch (error) {
		console.error("An error occurred while marking conversation as seen: ", error);
		return res.status(500).json({ message: "Internal server error" });
	}
}

export async function getMediaByType(req, res) {
	try {
		const { conversationId } = req.params;
		const { type, limit = 8, cursor } = req.query;

		const allowedTypes = ['image', 'file', 'link'];
		if (!type || !allowedTypes.includes(type)) {
			return res.status(400).json({ message: 'Invalid type. Must be one of: image, file, link' });
		}

		const query = { conversationId, isRecalled: { $ne: true } };

		if (type === 'image') {
			query.type = 'image';
			query.filePublicId = { $ne: null };
		} else if (type === 'file') {
			query.type = 'file';
			query.filePublicId = { $ne: null };
		} else if (type === 'link') {
			query.type = 'link';
			query.content = { $ne: null };
		}

		if (cursor) {
			query.createdAt = { $lt: new Date(cursor) };
		}

		const numLimit = Number(limit);
		let messages = await Message.find(query)
			.sort({ createdAt: -1 })
			.limit(numLimit + 1)
			.lean();

		let nextCursor = null;
		if (messages.length > numLimit) {
			nextCursor = messages[messages.length - 1].createdAt;
			messages.pop();
		}

		return res.status(200).json({ messages, nextCursor });
	} catch (error) {
		console.error("Error fetching media by type:", error);
		return res.status(500).json({ message: "Internal server error" });
	}
}

export async function updateGroupName(req, res) {
	try {
		const { conversationId } = req.params;
		const { name } = req.body;
		const userId = req.user._id.toString();
		if (!name || name.trim() === '') {
			return res.status(400).json({ message: 'Group name is required.' });
		}
		const conversation = await Conversation.findById(conversationId);
		if (!conversation) {
			return res.status(404).json({ message: "Conversation not found" });
		}
		if (conversation.type !== 'group') {
			return res.status(400).json({ message: "Only group conversations can be renamed" });
		}
		if (!conversation.participants.some(p => p.userId.toString() === userId)) {
			return res.status(403).json({ message: "Only group participants can rename the group" });
		}
		conversation.group.name = name;
		await conversation.save();
		return res.status(200).json({ message: "Group name updated successfully" });
	} catch (error) {
		console.error("An error occurred while updating group name: ", error);
		return res.status(500).json({ message: "Internal server error" });
	}
}

async function disbandGroup(conversation, io) {
	conversation.disbanded = true;
	await conversation.save();
	io.to(conversation._id.toString()).emit('group-disbanded', { conversationId: conversation._id });
}

export async function disbandGroupByAdmin(req, res) {
	try {
		const { conversationId } = req.params;
		const userId = req.user._id.toString();
		const io = req.app.get('io');

		const conversation = await Conversation.findById(conversationId);
		if (!conversation) {
			return res.status(404).json({ message: 'Conversation not found.' });
		}

		if (conversation.type !== 'group') {
			return res.status(400).json({ message: 'Only group conversations can be disbanded.' });
		}

		if (!conversation.group.admins.some(adminId => adminId.toString() === userId)) {
			return res.status(403).json({ message: 'Only admins can disband the group.' });
		}

		await disbandGroup(conversation, io);
		res.status(200).json({ message: 'Group disbanded successfully.' });
	} catch (error) {
		console.error('Error disbanding group:', error);
		res.status(500).json({ message: 'Internal server error' });
	}
}