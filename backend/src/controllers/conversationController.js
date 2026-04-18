import Conversation from '../models/conversationModel.js';
import Message from '../models/messageModel.js';
import Friend from '../models/friendModel.js';
import BlockUser from '../models/blockUserModel.js';
import User from '../models/userModel.js';
import {
	uploadImageFromBuffer,
	deleteCloudinaryResource,
	MAX_IMAGE_SIZE,
} from '../middlewares/uploadMiddleware.js';
import { io, getReceiverSocketId } from '../socket/index.js';
import { updateConversationLastMessage, emitNewMessage } from '../utils/messageHelper.js';
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

		const visibleMessageFilter = {
			$or: [
				{ 'metadata.visibleToUserIds': { $exists: false } },
				{ 'metadata.visibleToUserIds': { $size: 0 } },
				{ 'metadata.visibleToUserIds': myId },
			],
		};

		let conversations = await Conversation.find({ "participants.userId": myId })
			.sort({ "lastMessage.createdAt": -1, updatedAt: -1 })
			.populate("participants.userId", "displayName avatarUrl email bio phone")
			.populate("lastMessage.senderId", "displayName avatarUrl")
			.populate("seenBy", "displayName avatarUrl")
			.lean();

		conversations = await Promise.all(conversations.map(async (conversation) => {
			const lastMetadata = conversation.lastMessage?.metadata instanceof Map
				? Object.fromEntries(conversation.lastMessage.metadata)
				: (conversation.lastMessage?.metadata || {});
			const visibleToUserIds = Array.isArray(lastMetadata?.visibleToUserIds)
				? lastMetadata.visibleToUserIds.map((id) => id.toString())
				: [];

			if (!visibleToUserIds.length || visibleToUserIds.includes(myId)) {
				return conversation;
			}

			const fallback = await Message.findOne({ conversationId: conversation._id, ...visibleMessageFilter })
				.sort({ createdAt: -1 })
				.populate('senderId', 'displayName avatarUrl')
				.lean();

			if (!fallback) {
				return {
					...conversation,
					lastMessage: null,
					seenBy: [],
				};
			}

			const fallbackMetadata = fallback.metadata instanceof Map
				? Object.fromEntries(fallback.metadata)
				: (fallback.metadata || null);

			return {
				...conversation,
				lastMessage: {
					_id: fallback._id,
					content: fallback.content,
					type: fallback.type,
					systemType: fallback.systemType || null,
					metadata: fallbackMetadata,
					createdAt: fallback.createdAt,
					senderId: fallback.senderId,
				},
				seenBy: [],
			};
		}));

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

		const formatted = conversations.map((c) => {
			const myParticipant = c.participants?.find((p) => {
				const participantId = p?.userId?._id?.toString?.() || p?.userId?.toString?.();
				return participantId === myId;
			});

			const pinnedAt = myParticipant?.pinnedAt
				? new Date(myParticipant.pinnedAt).toISOString()
				: null;

			return {
				...c,
				isPinned: !!pinnedAt,
				pinnedAt,
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
			};
		});

		formatted.sort((a, b) => {
			if (a.isPinned !== b.isPinned) {
				return a.isPinned ? -1 : 1;
			}

			if (a.isPinned && b.isPinned) {
				const pinnedA = new Date(a.pinnedAt || 0).getTime();
				const pinnedB = new Date(b.pinnedAt || 0).getTime();
				if (pinnedA !== pinnedB) {
					return pinnedB - pinnedA;
				}
			}

			const dateA = new Date(a.lastMessage?.createdAt || a.updatedAt || 0).getTime();
			const dateB = new Date(b.lastMessage?.createdAt || b.updatedAt || 0).getTime();
			return dateB - dateA;
		});

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
		query.$or = [
			{ 'metadata.visibleToUserIds': { $exists: false } },
			{ 'metadata.visibleToUserIds': { $size: 0 } },
			{ 'metadata.visibleToUserIds': userId },
		];
		if (cursor) {
			query.createdAt = { $lt: new Date(cursor) };
		}
		if (clearedAt) {
			query.createdAt = { ...query.createdAt, $gt: clearedAt };
		}

		const pinnedQuery = {
			conversationId: query.conversationId,
			isPinned: true,
			$or: query.$or,
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

export async function toggleConversationPin(req, res) {
	try {
		const { conversationId } = req.params;
		const userId = req.user._id.toString();

		const conversation = await Conversation.findById(conversationId);
		if (!conversation) {
			return res.status(404).json({ message: 'Conversation not found.' });
		}

		const participant = conversation.participants.find(
			(p) => p.userId.toString() === userId
		);

		if (!participant) {
			return res.status(403).json({ message: 'You are not a participant in this conversation.' });
		}

		const wasPinned = !!participant.pinnedAt;
		participant.pinnedAt = wasPinned ? null : new Date();
		conversation.markModified('participants');
		await conversation.save();

		const payload = {
			_id: conversation._id,
			isPinned: !wasPinned,
			pinnedAt: participant.pinnedAt ? participant.pinnedAt.toISOString() : null,
		};

		const mySocketId = getReceiverSocketId(userId);
		if (mySocketId) {
			io.to(mySocketId).emit('conversation-updated', { conversation: payload });
		}

		return res.status(200).json({
			message: payload.isPinned ? 'Conversation pinned.' : 'Conversation unpinned.',
			conversation: payload,
		});
	} catch (error) {
		console.error('Error toggling conversation pin:', error);
		return res.status(500).json({ message: 'Internal server error' });
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

export async function updateGroupAvatar(req, res) {
	try {
		const { conversationId } = req.params;
		const userId = req.user._id.toString();

		if (!req.file) {
			return res.status(400).json({ message: 'No file uploaded.' });
		}

		if (!req.file.mimetype?.startsWith('image/')) {
			return res.status(400).json({ message: 'Uploaded file is not an image.' });
		}

		if (req.file.size > MAX_IMAGE_SIZE) {
			return res.status(413).json({
				message: `Ảnh quá lớn. Kích thước tối đa là ${MAX_IMAGE_SIZE / 1024 / 1024}MB.`,
			});
		}

		const conversation = await Conversation.findById(conversationId);
		if (!conversation) {
			return res.status(404).json({ message: 'Conversation not found.' });
		}

		if (conversation.type !== 'group') {
			return res.status(400).json({ message: 'Only group conversations can update avatar.' });
		}

		if (conversation.disbanded === true) {
			return res.status(403).json({ message: 'Nhóm này đã bị giải tán, bạn không thể thực hiện thao tác.' });
		}

		if (!conversation.participants.some((p) => p.userId.toString() === userId)) {
			return res.status(403).json({ message: 'Only group participants can update group avatar.' });
		}

		const previousAvatarId = conversation.group?.avatarId || null;
		const uploadResult = await uploadImageFromBuffer(req.file.buffer, 'NexCon/groups/avatars');

		conversation.group.avatarUrl = uploadResult.secure_url;
		conversation.group.avatarId = uploadResult.public_id;

		const systemMessage = new Message({
			conversationId,
			senderId: req.user._id,
			senderInfo: {
				displayName: req.user.displayName,
				avatarUrl: req.user.avatarUrl,
			},
			type: 'system',
			systemType: 'group_avatar_updated',
			metadata: {
				updatedBy: req.user._id,
				updatedByName: req.user.displayName,
				groupAvatarUrl: uploadResult.secure_url,
			},
			content: `${req.user.displayName} đã đổi ảnh đại diện nhóm`,
		});

		const savedMsg = await systemMessage.save();
		const finalMsg = await Message.findById(savedMsg._id).populate('senderId', 'displayName avatarUrl');

		updateConversationLastMessage(conversation, finalMsg, req.user._id);
		await conversation.save();

		if (previousAvatarId && previousAvatarId !== uploadResult.public_id) {
			try {
				await deleteCloudinaryResource(previousAvatarId, 'image');
			} catch (error) {
				console.warn('Delete old group avatar warning:', error?.message || error);
			}
		}

		const updatedConversation = await Conversation.findById(conversationId).populate({
			path: 'participants.userId',
			select: 'displayName avatarUrl nickname email bio phone status lastSeen',
		});

		emitNewMessage(io, updatedConversation, finalMsg);

		io.to(conversationId.toString()).emit('conversation-updated', {
			conversationId,
			conversation: updatedConversation,
		});

		return res.status(200).json({
			success: true,
			message: 'Group avatar updated successfully.',
			conversation: updatedConversation,
		});
	} catch (error) {
		console.error('Error updating group avatar:', error);
		return res.status(500).json({ message: 'Internal server error' });
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
		const normalizedUserIds = filteredUserIds.map(id => id.toString());

		if (filteredUserIds.length === 0) {
			return res.status(400).json({ message: 'Tất cả người dùng được chọn đã là thành viên của nhóm.' });
		}

		const friendshipEdges = await Friend.find({
			$or: [
				{ userA: currentUserId, userB: { $in: normalizedUserIds } },
				{ userB: currentUserId, userA: { $in: normalizedUserIds } },
			],
		}).select('userA userB').lean();

		const friendIdSet = new Set();
		friendshipEdges.forEach((edge) => {
			const a = edge.userA.toString();
			const b = edge.userB.toString();
			friendIdSet.add(a === currentUserId ? b : a);
		});

		const notFriendIds = normalizedUserIds.filter((id) => !friendIdSet.has(id));
		if (notFriendIds.length > 0) {
			return res.status(403).json({
				message: 'Bạn chỉ có thể thêm bạn bè vào nhóm.',
				notFriends: notFriendIds,
			});
		}

		const blockedRelations = await BlockUser.find({
			$or: [
				{ from: currentUserId, to: { $in: normalizedUserIds } },
				{ to: currentUserId, from: { $in: normalizedUserIds } },
			],
		}).select('from to').lean();

		if (blockedRelations.length > 0) {
			const blockedIds = new Set();
			blockedRelations.forEach((row) => {
				const from = row.from.toString();
				const to = row.to.toString();
				blockedIds.add(from === currentUserId ? to : from);
			});

			return res.status(403).json({
				message: 'Không thể thêm người dùng đã chặn bạn hoặc bị bạn chặn.',
				blockedUserIds: Array.from(blockedIds),
			});
		}

		const MAX_MEMBERS = 100;
		if (conversation.participants.length + filteredUserIds.length > MAX_MEMBERS) {
			return res.status(400).json({ message: `Nhóm chỉ có thể chứa tối đa ${MAX_MEMBERS} thành viên.` });
		}
		const membersToAdd = await User.find({ _id: { $in: filteredUserIds } }).select('displayName avatarUrl');

		if (conversation.group.isApprovalRequired && !conversation.group.admins.some(adminId => adminId.toString() === currentUserId)) {
			let addedCount = 0;
			filteredUserIds.forEach(id => {
				const alreadyInQueue = conversation.group.approvalQueue.some(q => q.userId.toString() === id.toString());
				if (!alreadyInQueue) {
					conversation.group.approvalQueue.push({
						userId: id,
						addedBy: currentUserId,
						createdAt: new Date()
					});
					addedCount++;
				}
			});

			if (addedCount > 0) {
				await conversation.save();
				io.to(conversationId.toString()).emit('approval-requested', { conversationId });
				io.to(conversationId.toString()).emit('approval-queue-updated', { conversationId });
				return res.status(200).json({
					success: true,
					message: `Đã gửi yêu cầu tham gia cho ${addedCount} người dùng. Vui lòng chờ quản trị viên phê duyệt.`,
					approvalRequired: true
				});
			} else {
				return res.status(400).json({ message: 'Tất cả người dùng được chọn đã có trong hàng chờ phê duyệt.' });
			}
		}

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
				addedByInfo: {
					displayName: req.user.displayName,
					avatarUrl: req.user.avatarUrl
				},
				addedUserIds: filteredUserIds,
				addedUserNames: addedUserNamesString,
				addedUsersInfo: addedUsersInfo
			},
			content: `Đã thêm ${addedUserNamesString} vào nhóm`
		});

		const savedMsg = await systemMessage.save();
		const finalMsg = await Message.findById(savedMsg._id).populate('senderId', 'displayName avatarUrl');


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

export async function updateSettings(req, res) {
	try {
		const { conversationId } = req.params;
		const { isApprovalRequired } = req.body;
		const userId = req.user._id.toString();

		const conversation = await Conversation.findById(conversationId);
		if (!conversation) return res.status(404).json({ message: 'Conversation not found.' });
		if (conversation.type !== 'group') return res.status(400).json({ message: 'Only group conversations have settings.' });
		if (!conversation.group.admins.some(adminId => adminId.toString() === userId)) {
			return res.status(403).json({ message: 'Only admins can update group settings.' });
		}
		if (conversation.disbanded) return res.status(403).json({ message: 'Nhóm này đã bị giải tán.' });

		if (isApprovalRequired !== undefined) {
			conversation.group.isApprovalRequired = isApprovalRequired;
			if (!isApprovalRequired) {
				conversation.group.approvalQueue = [];
			}
		}

		await conversation.save();

		if (isApprovalRequired !== undefined) {
			io.to(conversationId.toString()).emit('approval-queue-updated', { conversationId });


			const systemMessage = new Message({
				conversationId,
				senderId: userId,
				senderInfo: { displayName: req.user.displayName, avatarUrl: req.user.avatarUrl },
				type: 'system',
				systemType: 'approval_mode_changed',
				metadata: {
					changedBy: userId,
					changedByName: req.user.displayName,
					isApprovalRequired: isApprovalRequired,
				},
				content: isApprovalRequired ? `Đã bật chế độ phê duyệt thành viên mới` : `Đã tắt chế độ phê duyệt thành viên mới`
			});

			const savedMsg = await systemMessage.save();
			const finalMsg = await Message.findById(savedMsg._id).populate('senderId', 'displayName avatarUrl');

			updateConversationLastMessage(conversation, finalMsg, userId);
			await conversation.save();

			const updatedConversation = await Conversation.findById(conversationId).populate({
				path: 'participants.userId',
				select: 'displayName avatarUrl nickname email bio phone status lastSeen'
			});

			emitNewMessage(io, updatedConversation, finalMsg);
		}

		return res.status(200).json({ success: true, message: 'Settings updated successfully.', group: conversation.group });
	} catch (error) {
		console.error('Error updating settings:', error);
		res.status(500).json({ message: 'Internal server error' });
	}
}

export async function handleApproval(req, res) {
	try {
		const { conversationId } = req.params;
		const { userId, action } = req.body;
		const currentUserId = req.user._id.toString();

		if (!userId || !['approve', 'reject'].includes(action)) {
			return res.status(400).json({ message: 'Invalid request data.' });
		}

		const conversation = await Conversation.findById(conversationId);
		if (!conversation) return res.status(404).json({ message: 'Conversation not found.' });
		if (conversation.type !== 'group') return res.status(400).json({ message: 'Only group conversations have approvals.' });
		if (!conversation.group.admins.some(adminId => adminId.toString() === currentUserId)) {
			return res.status(403).json({ message: 'Only admins can handle approvals.' });
		}
		if (conversation.disbanded) return res.status(403).json({ message: 'Nhóm này đã bị giải tán.' });

		const queueIndex = conversation.group.approvalQueue.findIndex(q => q.userId.toString() === userId.toString());
		if (queueIndex === -1) {
			return res.status(400).json({ message: 'User is not in the approval queue.' });
		}

		const queueItem = conversation.group.approvalQueue[queueIndex];
		const originalAddedById = queueItem.addedBy;

		conversation.group.approvalQueue.splice(queueIndex, 1);

		if (action === 'approve') {
			if (!conversation.participants.some(p => p.userId.toString() === userId.toString())) {
				const memberToAdd = await User.findById(userId).select('displayName avatarUrl');
				const addedByUser = await User.findById(originalAddedById).select('displayName avatarUrl');
				if (memberToAdd) {
					conversation.participants.push({
						userId: memberToAdd._id,
						userInfo: { displayName: memberToAdd.displayName, avatarUrl: memberToAdd.avatarUrl },
						joinedAt: new Date()
					});

					conversation.unreadCounts.set(memberToAdd._id.toString(), 0);

					// Save to assign _ids if needed
					await conversation.save();

					// System message

					const systemMessage = new Message({
						conversationId,
						senderId: currentUserId,
						senderInfo: { displayName: req.user.displayName, avatarUrl: req.user.avatarUrl },
						type: 'system',
						systemType: 'member_added',
						metadata: {
							addedBy: originalAddedById,
							addedByName: addedByUser ? addedByUser.displayName : 'Một người dùng',
							addedByInfo: {
								displayName: addedByUser ? addedByUser.displayName : 'Một người dùng',
								avatarUrl: addedByUser?.avatarUrl || null
							},
							addedUserIds: [memberToAdd._id],
							addedUserNames: memberToAdd.displayName,
							addedUsersInfo: [{ _id: memberToAdd._id, displayName: memberToAdd.displayName, avatarUrl: memberToAdd.avatarUrl }]
						},
						content: `Đã duyệt ${memberToAdd.displayName} vào nhóm`
					});

					const savedMsg = await systemMessage.save();
					const finalMsg = await Message.findById(savedMsg._id).populate('senderId', 'displayName avatarUrl');

					updateConversationLastMessage(conversation, finalMsg, currentUserId);
					await conversation.save();

					const updatedConversation = await Conversation.findById(conversationId).populate({
						path: 'participants.userId',
						select: 'displayName avatarUrl nickname email bio phone status lastSeen'
					});

					emitNewMessage(io, updatedConversation, finalMsg);
					io.to(conversationId.toString()).emit('members-added', { conversationId, conversation: updatedConversation });

					const receiverSocketId = getReceiverSocketId(userId.toString());
					if (receiverSocketId) {
						const receiverSocket = io.sockets.sockets.get(receiverSocketId);
						if (receiverSocket) receiverSocket.join(conversationId.toString());
						io.to(receiverSocketId).emit("new-conversation", { conversation: updatedConversation });
					}
				}
			}
		} else {
			await conversation.save();
		}

		io.to(conversationId.toString()).emit('approval-queue-updated', { conversationId });

		return res.status(200).json({ success: true, message: action === 'approve' ? 'Đã duyệt yêu cầu.' : 'Đã từ chối yêu cầu.' });
	} catch (error) {
		console.error('Error handling approval:', error);
		res.status(500).json({ message: 'Internal server error' });
	}
}

export async function getApprovalQueue(req, res) {
	try {
		const { conversationId } = req.params;
		const userId = req.user._id.toString();

		const conversation = await Conversation.findById(conversationId)
			.populate('group.approvalQueue.userId', 'displayName avatarUrl email')
			.populate('group.approvalQueue.addedBy', 'displayName avatarUrl');

		if (!conversation) return res.status(404).json({ message: 'Conversation not found.' });
		if (conversation.type !== 'group') return res.status(400).json({ message: 'Not a group.' });
		if (!conversation.group.admins.some(adminId => adminId.toString() === userId)) {
			return res.status(403).json({ message: 'Only admins can view the queue.' });
		}

		return res.status(200).json({ success: true, queue: conversation.group.approvalQueue });
	} catch (error) {
		console.error('Error getting approval queue:', error);
		res.status(500).json({ message: 'Internal server error' });
	}
}

export async function removeMember(req, res) {
	try {
		const { conversationId, memberId } = req.params;
		const adminId = req.user._id.toString();

		const conversation = await Conversation.findById(conversationId);
		if (!conversation) {
			return res.status(404).json({ message: 'Conversation not found.' });
		}

		if (conversation.type !== 'group') {
			return res.status(400).json({ message: 'Only group conversations can have members removed.' });
		}

		if (conversation.disbanded) {
			return res.status(403).json({ message: 'Nhóm này đã bị giải tán, bạn không thể thực hiện thao tác.' });
		}

		if (!conversation.group.admins.some(id => id.toString() === adminId)) {
			return res.status(403).json({ message: 'Only admins can remove members.' });
		}

		if (memberId === adminId) {
			return res.status(400).json({ message: 'Admin cannot remove themselves using this route.' });
		}

		if (conversation.group.admins.some(id => id.toString() === memberId)) {
			return res.status(403).json({ message: 'Cannot remove another admin from the group.' });
		}

		const memberIndex = conversation.participants.findIndex(p => p.userId.toString() === memberId);
		if (memberIndex === -1) {
			return res.status(404).json({ message: 'Member not found in group.' });
		}
		const kickedUser = await User.findById(memberId).select('displayName avatarUrl');
		// Remove from participants and unread counts
		conversation.participants.splice(memberIndex, 1);
		conversation.unreadCounts.delete(memberId);
		// Record removal in a system message
		const systemMessage = new Message({
			conversationId,
			senderId: adminId,
			senderInfo: { displayName: req.user.displayName, avatarUrl: req.user.avatarUrl },
			type: 'system',
			systemType: 'member_kicked',
			metadata: {
				adminId: adminId,
				adminName: req.user.displayName,
				kickedUserId: memberId,
				kickedUserName: kickedUser ? kickedUser.displayName : "Người dùng",
				kickedUserAvatarUrl: kickedUser?.avatarUrl || null
			},
			content: `Đã đưa ${kickedUser ? kickedUser.displayName : "Người dùng"} ra khỏi nhóm`
		});

		const savedMsg = await systemMessage.save();
		const finalMsg = await Message.findById(savedMsg._id).populate('senderId', 'displayName avatarUrl');

		updateConversationLastMessage(conversation, finalMsg, adminId);
		await conversation.save();

		const updatedConversation = await Conversation.findById(conversationId).populate({
			path: 'participants.userId',
			select: 'displayName avatarUrl nickname email bio phone status lastSeen'
		});

		emitNewMessage(io, updatedConversation, finalMsg);

		io.to(conversationId.toString()).emit('member-removed', {
			conversationId,
			conversation: updatedConversation,
			removedUserId: memberId
		});

		const receiverSocketId = getReceiverSocketId(memberId.toString());
		if (receiverSocketId) {
			const receiverSocket = io.sockets.sockets.get(receiverSocketId);
			if (receiverSocket) {
				receiverSocket.leave(conversationId.toString());
			}
			io.to(receiverSocketId).emit('kicked-from-group', { conversationId });
		}

		return res.status(200).json({ success: true, message: 'Member removed successfully.', conversation: updatedConversation });

	} catch (error) {
		console.error('Error removing member:', error);
		res.status(500).json({ message: 'Internal server error' });
	}
}

async function transferAdmin(conversation, newAdminId) {
	conversation.group.admins = [newAdminId];

	await conversation.save();

	const newAdmin = await User.findById(newAdminId).select('displayName avatarUrl');

	return {
		displayName: newAdmin?.displayName || 'Người dùng',
		avatarUrl: newAdmin?.avatarUrl || null
	};
}

export async function transferAdminRole(req, res) {
	try {
		const { conversationId, memberId } = req.params;
		const currentAdminId = req.user._id.toString();

		const conversation = await Conversation.findById(conversationId);
		if (!conversation) {
			return res.status(404).json({ message: 'Conversation not found.' });
		}

		if (conversation.type !== 'group') {
			return res.status(400).json({ message: 'Only group conversations can transfer admin role.' });
		}

		if (conversation.disbanded === true) {
			return res.status(403).json({ message: 'Nhóm này đã bị giải tán, bạn không thể thực hiện thao tác.' });
		}

		if (!conversation.group.admins.some(adminId => adminId.toString() === currentAdminId)) {
			return res.status(403).json({ message: 'Only admins can transfer admin role.' });
		}

		if (!conversation.participants.some(p => p.userId.toString() === memberId.toString())) {
			return res.status(400).json({ message: 'User is not a participant in this group.' });
		}

		const appointedUserInfo = await transferAdmin(conversation, memberId);
		const appointedByInfo = {
			displayName: req.user.displayName,
			avatarUrl: req.user.avatarUrl
		};

		const systemMessage = new Message({
			conversationId,
			senderId: req.user._id,
			senderInfo: appointedByInfo,
			type: 'system',
			systemType: 'admin_transferred',
			metadata: {
				appointedBy: req.user._id,
				appointedByInfo,
				appointedUserId: memberId,
				appointedUserInfo: {
					displayName: appointedUserInfo.displayName,
					avatarUrl: appointedUserInfo.avatarUrl
				}
			},
			content: `${appointedByInfo.displayName} đã chuyển quyền trưởng nhóm cho ${appointedUserInfo.displayName}`
		});

		const savedMsg = await systemMessage.save();
		const finalMsg = await Message.findById(savedMsg._id).populate('senderId', 'displayName avatarUrl');

		updateConversationLastMessage(conversation, finalMsg, req.user._id);
		await conversation.save();

		const updatedConversation = await Conversation.findById(conversationId).populate({
			path: 'participants.userId',
			select: 'displayName avatarUrl nickname email bio phone status lastSeen'
		});

		io.to(conversationId.toString()).emit('admin-transferred', {
			conversationId,
			newAdminId: memberId
		});

		emitNewMessage(io, updatedConversation, finalMsg);

		return res.status(200).json({ success: true, message: 'Bổ nhiệm admin thành công' });
	} catch (error) {
		console.error('Error transferring admin role:', error);
		res.status(500).json({ message: 'Internal server error' });
	}
}

export async function leaveGroup(req, res) {
	try {
		const { conversationId } = req.params;
		const { silent = false, newAdminId } = req.body;
		const userId = req.user._id.toString();

		const conversation = await Conversation.findById(conversationId);
		if (!conversation) {
			return res.status(404).json({ message: 'Conversation not found.' });
		}
		if (conversation.type !== 'group') {
			return res.status(400).json({ message: 'Only group conversations can be left.' });
		}
		if (conversation.disbanded) {
			return res.status(403).json({ message: 'Nhóm này đã bị giải tán.' });
		}

		const memberIndex = conversation.participants.findIndex(p => p.userId.toString() === userId);
		if (memberIndex === -1) {
			return res.status(400).json({ message: 'Bạn không phải thành viên của nhóm này.' });
		}

		const isAdmin = conversation.group.admins.some(id => id.toString() === userId);
		const remainingParticipants = conversation.participants.filter((_, i) => i !== memberIndex);
		let promotedAdminId = null;
		let promotedAdminName = null;
		let promotedAdminAvatarUrl = null;

		if (remainingParticipants.length === 0) {
			await disbandGroup(conversation, req.user);
			return res.status(200).json({ success: true, message: 'Rời nhóm và giải tán nhóm thành công.' });
		}

		if (isAdmin) {
			if (!newAdminId) {
				return res.status(400).json({ message: 'Bạn cần chọn trưởng nhóm mới trước khi rời nhóm.' });
			}

			const newAdminParticipant = remainingParticipants.find(
				(p) => p.userId.toString() === newAdminId.toString()
			);

			if (!newAdminParticipant) {
				return res.status(400).json({ message: 'Trưởng nhóm mới phải là thành viên còn lại trong nhóm.' });
			}

			conversation.group.admins = [newAdminParticipant.userId];
			promotedAdminId = newAdminParticipant.userId.toString();
			const promotedAdminUser = await User.findById(newAdminParticipant.userId).select('displayName avatarUrl');
			promotedAdminName =
				newAdminParticipant.userInfo?.displayName ||
				promotedAdminUser?.displayName ||
				'Một thành viên';
			promotedAdminAvatarUrl =
				newAdminParticipant.userInfo?.avatarUrl ||
				promotedAdminUser?.avatarUrl ||
				null;
		}

		conversation.participants.splice(memberIndex, 1);
		conversation.unreadCounts.delete(userId);

		if (!silent) {
			const leaveMessage = new Message({
				conversationId,
				senderId: userId,
				senderInfo: { displayName: req.user.displayName, avatarUrl: req.user.avatarUrl },
				type: 'system',
				systemType: 'member_left',
				metadata: {
					leftUserId: userId,
					leftUserName: req.user.displayName,
					isSilentLeave: false,
				},
				content: `${req.user.displayName} đã rời khỏi nhóm`
			});

			const savedLeaveMsg = await leaveMessage.save();
			const finalLeaveMsg = await Message.findById(savedLeaveMsg._id).populate('senderId', 'displayName avatarUrl');
			updateConversationLastMessage(conversation, finalLeaveMsg, userId);
			await conversation.save();

			const updatedConversationForLeave = await Conversation.findById(conversationId).populate({
				path: 'participants.userId',
				select: 'displayName avatarUrl nickname email bio phone status lastSeen'
			});

			emitNewMessage(io, updatedConversationForLeave, finalLeaveMsg);

			if (promotedAdminId) {
				const transferMessage = new Message({
					conversationId,
					senderId: userId,
					senderInfo: { displayName: req.user.displayName, avatarUrl: req.user.avatarUrl },
					type: 'system',
					systemType: 'admin_transferred',
					metadata: {
						appointedBy: userId,
						appointedByInfo: { displayName: req.user.displayName, avatarUrl: req.user.avatarUrl },
						appointedUserId: promotedAdminId,
						appointedUserInfo: { displayName: promotedAdminName, avatarUrl: promotedAdminAvatarUrl }
					},
					content: `${promotedAdminName} đã trở thành trưởng nhóm mới`
				});

				const savedTransferMsg = await transferMessage.save();
				const finalTransferMsg = await Message.findById(savedTransferMsg._id).populate('senderId', 'displayName avatarUrl');
				updateConversationLastMessage(conversation, finalTransferMsg, userId);
				await conversation.save();

				const updatedConversationForTransfer = await Conversation.findById(conversationId).populate({
					path: 'participants.userId',
					select: 'displayName avatarUrl nickname email bio phone status lastSeen'
				});

				emitNewMessage(io, updatedConversationForTransfer, finalTransferMsg);
			}
		} else {
			await conversation.save();
		}

		const updatedConversation = await Conversation.findById(conversationId).populate({
			path: 'participants.userId',
			select: 'displayName avatarUrl nickname email bio phone status lastSeen'
		});

		if (silent) {
			const adminIds = Array.from(new Set((conversation.group?.admins || []).map((id) => id.toString())));

			const silentLeaveMessage = new Message({
				conversationId,
				senderId: userId,
				senderInfo: { displayName: req.user.displayName, avatarUrl: req.user.avatarUrl },
				type: 'system',
				systemType: 'member_left',
				metadata: {
					leftUserId: userId,
					leftUserName: req.user.displayName,
					leftUserAvatarUrl: req.user.avatarUrl,
					isSilentLeave: true,
					visibleToUserIds: adminIds,
				},
				content: `${req.user.displayName} đã rời khỏi nhóm trong im lặng`,
			});

			const savedSilentMsg = await silentLeaveMessage.save();
			const finalSilentMsg = await Message.findById(savedSilentMsg._id).populate('senderId', 'displayName avatarUrl');

			const payloadMessage = typeof finalSilentMsg.toObject === 'function' ? finalSilentMsg.toObject() : { ...finalSilentMsg };
			if (payloadMessage.metadata instanceof Map) {
				payloadMessage.metadata = Object.fromEntries(payloadMessage.metadata);
			}

			const lastMsgRaw = updatedConversation.lastMessage?.toObject?.() || updatedConversation.lastMessage;
			const lastMsgPayload = { ...lastMsgRaw };
			if (lastMsgPayload?.metadata instanceof Map) {
				lastMsgPayload.metadata = Object.fromEntries(lastMsgPayload.metadata);
			}

			adminIds.forEach((adminId) => {
				const adminSocketId = getReceiverSocketId(adminId);
				if (!adminSocketId) return;
				io.to(adminSocketId).emit('new-message', {
					message: payloadMessage,
					conversation: {
						_id: updatedConversation._id,
						lastMessage: lastMsgPayload,
						lastMessageAt: updatedConversation.lastMessageAt,
					},
					unreadCounts: updatedConversation.unreadCounts,
				});
			});
		}

		io.to(conversationId.toString()).emit('member-left', {
			conversationId,
			conversation: updatedConversation,
			leftUserId: userId,
		});

		if (promotedAdminId) {
			io.to(conversationId.toString()).emit('admin-transferred', {
				conversationId,
				newAdminId: promotedAdminId
			});
		}

		const userSocketId = getReceiverSocketId(userId);
		if (userSocketId) {
			const userSocket = io.sockets.sockets.get(userSocketId);
			if (userSocket) userSocket.leave(conversationId.toString());
			io.to(userSocketId).emit('left-group', { conversationId });
		}

		return res.status(200).json({ success: true, message: 'Rời nhóm thành công.' });
	} catch (error) {
		console.error('Error leaving group:', error);
		res.status(500).json({ message: 'Internal server error' });
	}
}