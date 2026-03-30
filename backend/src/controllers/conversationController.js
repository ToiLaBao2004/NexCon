import Conversation from '../models/conversationModel.js';
import Message from '../models/messageModel.js';
import Friend from '../models/friendModel.js';
import User from '../models/userModel.js';
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
			const partner = await User.findById(participantId).select('displayName avatarUrl');
			if (!conversation) {
				conversation = new Conversation({
					type: 'direct',
					participants: [
						{ userId: userId, userInfo: { displayName: req.user.displayName, avatarUrl: req.user.avatarUrl }, joinedAt: new Date() },
						{ userId: participantId, userInfo: { displayName: partner?.displayName || 'User', avatarUrl: partner?.avatarUrl }, joinedAt: new Date() }
					]
				});
				conversation = await Conversation.create(conversation);
			}
		}
		if (type === 'group') {
			const members = await User.find({ _id: { $in: memberIds } }).select('displayName avatarUrl');
			const participants = members.map(m => ({
				userId: m._id,
				userInfo: { displayName: m.displayName, avatarUrl: m.avatarUrl },
				joinedAt: new Date()
			}));
			participants.push({
				userId: userId,
				userInfo: { displayName: req.user.displayName, avatarUrl: req.user.avatarUrl },
				joinedAt: new Date()
			});
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

		let conversations = await Conversation.find({ "participants.userId": myId })
			.sort({ "lastMessage.createdAt": -1, updatedAt: -1 })
			.populate("participants.userId", "displayName avatarUrl email bio phone")
			.populate("lastMessage.senderId", "displayName avatarUrl")
			.populate("seenBy", "displayName avatarUrl")
			.lean();

		conversations = conversations.filter(c => {
			const me = c.participants?.find(p => p.userId?._id?.toString() === myId);
			if (!me || !me.clearedAt) return true;

			const compareTime = c.lastMessage?.createdAt
				? new Date(c.lastMessage.createdAt).getTime()
				: new Date(c.updatedAt).getTime();
			return compareTime > new Date(me.clearedAt).getTime();
		});

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
			participants: c.participants
				.map((p) => {
					// Fallback to snapshot userInfo if user array is populated as null (user was deleted)
					let userObj = p.userId;
					if (!userObj && p.userInfo) {
						userObj = {
							_id: null,
							displayName: p.userInfo.displayName || "Người dùng đã xóa",
							avatarUrl: p.userInfo.avatarUrl || null
						};
					} else if (!userObj) {
						userObj = {
							_id: null,
							displayName: "Người dùng đã xóa",
							avatarUrl: null
						};
					}

					const pid = userObj?._id?.toString();
					const nickname = pid && pid !== myId ? nickMap.get(pid) || null : null;

					return {
						...p,
						userId: {
							...userObj,
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
		const userId = req.user._id.toString();

		const conversation = await Conversation.findById(conversationId).select('participants').lean();
		const me = conversation?.participants?.find(p => p.userId.toString() === userId);
		const clearedAt = me?.clearedAt ? new Date(me.clearedAt) : null;

		const query = { conversationId };
		if (cursor) {
			query.createdAt = { $lt: new Date(cursor) };
		}
		if (clearedAt) {
			query.createdAt = { ...query.createdAt, $gt: clearedAt };
		}

		const pinnedQuery = {
			conversationId: query.conversationId,
			isPinned: true,
		};
		if (clearedAt) {
			pinnedQuery.createdAt = { $gt: clearedAt };
		}

		const pinnedMessages = await Message.find(pinnedQuery)
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
			.populate('senderId', 'displayName avatarUrl')
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

		// Fallback for hard-deleted users
		const fallbackSender = (msg) => {
			if (msg && !msg.senderId) {
				msg.senderId = {
					_id: null,
					displayName: msg.senderInfo?.displayName || "Người dùng đã xóa",
					avatarUrl: msg.senderInfo?.avatarUrl || null
				};
			}
			if (msg?.replyTo && !msg.replyTo.senderId) {
				msg.replyTo.senderId = {
					_id: null,
					displayName: "Người dùng đã xóa"
				};
			}
			return msg;
		};

		messages = messages.map(fallbackSender);
		const safePinnedMessages = pinnedMessages.map(fallbackSender);

		return res.status(200).json({
			messages,
			nextCursor,
			pinnedMessages: safePinnedMessages,
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
				type: updated.lastMessage.type,
				systemType: updated.lastMessage.systemType,
				metadata: updated.lastMessage.metadata,
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
		if (conversation.disbanded === true) {
			return res.status(403).json({ message: 'Nhóm này đã bị giải tán, bạn không thể thực hiện thao tác.' });
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

async function disbandGroup(conversation, adminUser) {
	conversation.disbanded = true;

	const systemMessage = new Message({
		conversationId: conversation._id,
		senderId: adminUser._id,
		type: 'system',
		systemType: 'group_disbanded',
		metadata: {
			disbandedBy: adminUser._id,
			adminName: adminUser.displayName
		},
		content: 'Nhóm đã bị giải tán'
	});
	const savedMsg = await systemMessage.save();
	const finalMsg = await Message.findById(savedMsg._id).populate('senderId', 'displayName avatarUrl');

	const { updateConversationLastMessage, emitNewMessage } = await import('../utils/messageHelper.js');
	updateConversationLastMessage(conversation, finalMsg, adminUser._id);
	await conversation.save();

	io.to(conversation._id.toString()).emit('group-disbanded', { conversationId: conversation._id });
	emitNewMessage(io, conversation, finalMsg);
}
export async function disbandGroupByAdmin(req, res) {
	try {
		const { conversationId } = req.params;
		const userId = req.user._id.toString();

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

		await disbandGroup(conversation, req.user);
		res.status(200).json({ message: 'Group disbanded successfully.' });
	} catch (error) {
		console.error('Error disbanding group:', error);
		res.status(500).json({ message: 'Internal server error' });
	}
}

export async function clearConversation(req, res) {
	try {
		const { conversationId } = req.params;
		const userId = req.user._id;

		const conversation = await Conversation.findById(conversationId);
		if (!conversation) {
			return res.status(404).json({ message: 'Conversation not found.' });
		}

		const participant = conversation.participants.find(p => p.userId.toString() === userId.toString());
		if (!participant) {
			return res.status(403).json({ message: 'You are not a participant in this conversation.' });
		}

		participant.clearedAt = Date.now();
		conversation.markModified('participants');
		await conversation.save();

		return res.status(200).json({ message: 'Conversation cleared successfully.' });
	} catch (error) {
		console.error('Error clearing conversation:', error);
		res.status(500).json({ message: 'Internal server error' });
	}
}

export async function addMembers(req, res) {
	try {
		const { conversationId } = req.params;
		const { userIds } = req.body;
		const currentUserId = req.user._id.toString();

		if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
			return res.status(400).json({ message: 'User IDs are required and must be an array.' });
		}

		const conversation = await Conversation.findById(conversationId);
		if (!conversation) {
			return res.status(404).json({ message: 'Conversation not found.' });
		}

		if (conversation.type !== 'group') {
			return res.status(400).json({ message: 'Only group conversations can have members added.' });
		}

		if (conversation.disbanded === true) {
			return res.status(403).json({ message: 'Nhóm này đã bị giải tán, bạn không thể thực hiện thao tác.' });
		}
		if (!conversation.participants.some(p => p.userId.toString() === currentUserId)) {
			return res.status(403).json({ message: "Only group participants can add members." });
		}

		const filteredUserIds = userIds.filter(id =>
			!conversation.participants.some(p => p.userId.toString() === id.toString())
		);

		if (filteredUserIds.length === 0) {
			return res.status(400).json({ message: 'Tất cả người dùng được chọn đã là thành viên của nhóm.' });
		}
		const MAX_MEMBERS = 100;
		if (conversation.participants.length + filteredUserIds.length > MAX_MEMBERS) {
			return res.status(400).json({ message: `Nhóm chỉ có thể chứa tối đa ${MAX_MEMBERS} thành viên.` });
		}
		const membersToAdd = await User.find({ _id: { $in: filteredUserIds } }).select('displayName avatarUrl');

		filteredUserIds.forEach(id => {
			const member = membersToAdd.find(m => m._id.toString() === id.toString());
			conversation.participants.push({
				userId: id,
				userInfo: member ? { displayName: member.displayName, avatarUrl: member.avatarUrl } : undefined,
				joinedAt: new Date()
			});
		});

		await conversation.save();
		await conversation.populate([
			{ path: 'participants.userId', select: 'displayName avatarUrl email bio phone' },
			{ path: 'seenBy', select: 'displayName avatarUrl' },
			{ path: 'lastMessage.senderId', select: 'displayName avatarUrl' }
		]);
		const newParticipants = conversation.participants.filter(p =>
			filteredUserIds.some(id => id.toString() === p.userId._id?.toString())
		);
		const addedUserNamesString = newParticipants.map(p => p.userId.displayName || p.userInfo?.displayName).join(", ");
		const addedUsersInfo = newParticipants.map(p => ({
			_id: p.userId._id || p.userId,
			displayName: p.userId.displayName || p.userInfo?.displayName,
			avatarUrl: p.userId.avatarUrl || p.userInfo?.avatarUrl
		}));

		const systemMessage = new Message({
			conversationId,
			senderId: currentUserId,
			senderInfo: {
				displayName: req.user.displayName,
				avatarUrl: req.user.avatarUrl
			},
			type: 'system',
			systemType: 'member_added',
			metadata: {
				addedBy: currentUserId,
				addedByName: req.user.displayName,
				addedUserIds: filteredUserIds,
				addedUserNames: addedUserNamesString,
				addedUsersInfo: addedUsersInfo
			},
			content: `Đã thêm ${addedUserNamesString} vào nhóm`
		});

		const savedMsg = await systemMessage.save();
		const finalMsg = await Message.findById(savedMsg._id).populate('senderId', 'displayName avatarUrl');

		const { updateConversationLastMessage, emitNewMessage } = await import('../utils/messageHelper.js');
		updateConversationLastMessage(conversation, finalMsg, currentUserId);
		await conversation.save();

		// Refresh and populate to ensure full info for socket emit
		const updatedConversation = await Conversation.findById(conversationId).populate({
			path: 'participants.userId',
			select: 'displayName avatarUrl nickname about status lastSeen'
		});

		emitNewMessage(io, updatedConversation, finalMsg);

		// Also emit members-added with populated conversation so all existing members update
		// their state (participants list, avatars, member count) in real-time
		io.to(conversationId.toString()).emit('members-added', {
			conversationId,
			conversation: updatedConversation
		});

		filteredUserIds.forEach(newMemberId => {
			const receiverSocketId = getReceiverSocketId(newMemberId.toString());
			if (receiverSocketId) {
				const receiverSocket = io.sockets.sockets.get(receiverSocketId);
				if (receiverSocket) {
					receiverSocket.join(conversationId);
				}
				io.to(receiverSocketId).emit("new-conversation", { conversation });
			}
		});

		return res.status(200).json({
			success: true,
			conversation
		});

	} catch (error) {
		console.error('Error adding members:', error);
		res.status(500).json({ message: 'Internal server error' });
	}
}