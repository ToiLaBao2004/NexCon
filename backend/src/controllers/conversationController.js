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
import {
	io,
	getReceiverSocketId,
	joinUserSocketsToRoom,
	leaveUserSocketsFromRoom,
} from '../socket/index.js';
import { updateConversationLastMessage, emitNewMessage } from '../utils/messageHelper.js';
import {
	decryptConversationPayload,
	decryptConversationsPayload,
	decryptMessagePayload,
	decryptMessagesPayload,
} from '../utils/messageCrypto.js';
import { maskLockedUserDoc } from '../utils/lockedUser.js';
import { enqueueGroupCleanup } from '../config/groupCleanupQueue.js';
import { enqueueConversationClearCleanup } from '../config/conversationClearCleanupQueue.js';

const MUTE_DURATION_MS = {
	'1h': 60 * 60 * 1000,
	'8h': 8 * 60 * 60 * 1000,
	'24h': 24 * 60 * 60 * 1000,
};
const MAX_GROUP_MEMBERS = 100;
const MAX_PINNED_CONVERSATIONS = 5;
const MAX_SEARCH_QUERY_LENGTH = 100;

const PARTICIPANT_SELECT = 'displayName avatarUrl email bio phone lock';
const MESSAGE_SENDER_SELECT = 'displayName avatarUrl lock';
const CLIENT_PARTICIPANT_SELECT = 'displayName avatarUrl nickname email bio phone status lastSeen about lock';

function clampPageLimit(value, defaultLimit = 50, maxLimit = 100) {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed)) return defaultLimit;
	return Math.min(Math.max(parsed, 1), maxLimit);
}

function escapeRegex(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getConversationActivityTime(conversation) {
	return new Date(
		conversation?.lastMessage?.createdAt
		|| conversation?.updatedAt
		|| conversation?.createdAt
		|| 0
	).getTime();
}

function sortConversationsForClient(conversations = []) {
	return [...conversations].sort((a, b) => {
		const aPinned = a.isPinned === true;
		const bPinned = b.isPinned === true;

		if (aPinned !== bPinned) return aPinned ? -1 : 1;

		if (aPinned && bPinned) {
			const aPinnedAt = new Date(a.pinnedAt || 0).getTime();
			const bPinnedAt = new Date(b.pinnedAt || 0).getTime();
			if (aPinnedAt !== bPinnedAt) return bPinnedAt - aPinnedAt;
		}

		return getConversationActivityTime(b) - getConversationActivityTime(a);
	});
}

function sanitizeParticipantUser(userObj) {
	if (!userObj) return userObj;
	return maskLockedUserDoc(userObj);
}

function sanitizePopulatedConversation(conversation) {
	if (!conversation) return conversation;
	const raw = decryptConversationPayload(conversation);
	return {
		...raw,
		participants: (raw.participants || []).map((participant) => ({
			...participant,
			userId: sanitizeParticipantUser(participant.userId),
		})),
		lastMessage: raw.lastMessage?.senderId
			? {
				...raw.lastMessage,
				senderId: sanitizeParticipantUser(raw.lastMessage.senderId),
			}
			: raw.lastMessage,
	};
}

function isConversationParticipant(conversation, userId) {
	return conversation?.participants?.some((participant) => participant.userId.toString() === userId);
}

function isGroupAdmin(conversation, userId) {
	return conversation?.group?.admins?.some((adminId) => adminId.toString() === userId);
}

function sanitizeModeratedMessage(message) {
	if (!message) return message;
	const raw = decryptMessagePayload(message);
	const next = {
		...raw,
		senderId: raw.senderId && typeof raw.senderId === 'object'
			? sanitizeParticipantUser(raw.senderId)
			: raw.senderId,
	};

	if (next.replyTo?.messageId) {
		next.replyTo = {
			...next.replyTo,
			messageId: sanitizeModeratedMessage(next.replyTo.messageId),
		};
	}

	if (!next.reportStatus) return next;
	return {
		...next,
		content: 'Tin nhắn vi phạm tiêu chuẩn cộng đồng',
		filePublicId: undefined,
		fileUrl: undefined,
		fileName: undefined,
		fileSize: undefined,
		mimeType: undefined,
		reactions: [],
	};
}

function sanitizeMessages(messages = []) {
	return messages.map((message) => sanitizeModeratedMessage(message));
}

function getClearCleanupCutoff(conversation) {
	const clearTimes = (conversation.participants || [])
		.map((participant) => participant.clearedAt ? new Date(participant.clearedAt) : null);
	if (clearTimes.length === 0 || clearTimes.some((date) => !date || Number.isNaN(date.getTime()))) {
		return null;
	}

	return new Date(Math.min(...clearTimes.map((date) => date.getTime())));
}

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
			const partner = await User.findById(participantId).select('displayName avatarUrl lock');
			if (partner?.lock?.isLocked) {
				return res.status(423).json({ message: 'Không thể tạo cuộc trò chuyện với tài khoản đã bị khóa.' });
			}
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
			if (memberIds.length + 1 > MAX_GROUP_MEMBERS) {
				return res.status(400).json({ message: `Nhóm chỉ có thể chứa tối đa ${MAX_GROUP_MEMBERS} thành viên.` });
			}
			const members = await User.find({ _id: { $in: memberIds } }).select('displayName avatarUrl lock');
			const lockedMembers = members.filter((member) => member.lock?.isLocked);
			if (lockedMembers.length > 0) {
				return res.status(423).json({ message: 'Không thể thêm tài khoản đã bị khóa vào nhóm.' });
			}
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
			{ path: 'participants.userId', select: PARTICIPANT_SELECT },
			{ path: 'lastMessage.senderId', select: MESSAGE_SENDER_SELECT }
		]);
		conversation = sanitizePopulatedConversation(conversation);

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
		const limit = clampPageLimit(req.query.limit, 50, 100);
		const cursor = req.query.cursor;

		const unpinnedQuery = { participants: { $elemMatch: { userId: myId, pinnedAt: null } } };
		let cursorDate = null;
		if (cursor) {
			const d = new Date(cursor);
			if (!isNaN(d.getTime())) cursorDate = d;
		}

		const visibleMessageFilter = {
			$or: [
				{ 'metadata.visibleToUserIds': { $exists: false } },
				{ 'metadata.visibleToUserIds': { $size: 0 } },
				{ 'metadata.visibleToUserIds': myId },
			],
		};

		let rawConversations = [];
		let hasMore = false;
		let nextCursor = null;

		if (cursorDate) {
			const pageQuery = { ...unpinnedQuery, updatedAt: { $lt: cursorDate } };
			rawConversations = await Conversation.find(pageQuery)
				.sort({ updatedAt: -1 })
				.limit(limit + 1)
				.populate("participants.userId", PARTICIPANT_SELECT)
				.populate("lastMessage.senderId", MESSAGE_SENDER_SELECT)
				.lean();

			hasMore = rawConversations.length > limit;
			if (hasMore) rawConversations.pop();
			nextCursor = hasMore && rawConversations.length > 0
				? rawConversations[rawConversations.length - 1].updatedAt
				: null;
		} else {
			const rawPinnedConversations = await Conversation.find({
				participants: {
					$elemMatch: {
						userId: myId,
						pinnedAt: { $exists: true, $ne: null },
					},
				},
			})
				.populate("participants.userId", PARTICIPANT_SELECT)
				.populate("lastMessage.senderId", MESSAGE_SENDER_SELECT)
				.lean();

			const unpinnedLimit = Math.max(limit - rawPinnedConversations.length, 1);
			const rawUnpinnedConversations = await Conversation.find(unpinnedQuery)
				.sort({ updatedAt: -1 })
				.limit(unpinnedLimit + 1)
				.populate("participants.userId", PARTICIPANT_SELECT)
				.populate("lastMessage.senderId", MESSAGE_SENDER_SELECT)
				.lean();

			hasMore = rawUnpinnedConversations.length > unpinnedLimit;
			if (hasMore) rawUnpinnedConversations.pop();
			nextCursor = hasMore && rawUnpinnedConversations.length > 0
				? rawUnpinnedConversations[rawUnpinnedConversations.length - 1].updatedAt
				: null;
			rawConversations = [...rawPinnedConversations, ...rawUnpinnedConversations];
		}

		let conversations = decryptConversationsPayload(rawConversations);

		conversations = await Promise.all(conversations.map(async (conversation) => {
			const lastMetadata = conversation.lastMessage?.metadata instanceof Map
				? Object.fromEntries(conversation.lastMessage.metadata)
				: (conversation.lastMessage?.metadata || {});
			const visibleToUserIds = Array.isArray(lastMetadata?.visibleToUserIds)
				? lastMetadata.visibleToUserIds.map((id) => id.toString())
				: [];

			if ((!visibleToUserIds.length || visibleToUserIds.includes(myId)) && (!conversation.lastMessage || conversation.lastMessage._id)) {
				return conversation;
			}

			const fallback = await Message.findOne({ conversationId: conversation._id, ...visibleMessageFilter })
				.sort({ createdAt: -1 })
				.populate('senderId', MESSAGE_SENDER_SELECT)
				.lean();

			if (!fallback) {
				return {
					...conversation,
					lastMessage: null,
				};
			}

			const safeFallback = decryptMessagePayload(fallback);
			const fallbackMetadata = safeFallback.metadata instanceof Map
				? Object.fromEntries(safeFallback.metadata)
				: (safeFallback.metadata || null);

			return {
				...conversation,
				lastMessage: {
					_id: safeFallback._id,
					content: safeFallback.content,
					type: safeFallback.type,
					systemType: safeFallback.systemType || null,
					metadata: fallbackMetadata,
					createdAt: safeFallback.createdAt,
					senderId: safeFallback.senderId,
				},
			};
		}));

		conversations = conversations.filter(c => {
			const me = c.participants?.find(p => p.userId?._id?.toString() === myId);
			if (!me || !me.clearedAt) return true;
			if (!c.lastMessage) return false;

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

						userObj = sanitizeParticipantUser(userObj);
						const pid = userObj?._id?.toString();
						const nickname = userObj?.isLocked ? null : (pid && pid !== myId ? nickMap.get(pid) || null : null);

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

		return res.status(200).json({ conversations: sortConversationsForClient(formatted), hasMore, nextCursor });
	} catch (error) {
		console.error("Error occurred while fetching conversations", error);
		return res.status(500).json({ message: "Internal server error" });
	}
}

export async function getGroups(req, res) {
	try {
		const myId = req.user._id.toString();
		const limit = clampPageLimit(req.query.limit, 50, 100);
		const cursor = req.query.cursor;
		const searchValue = Array.isArray(req.query.search) ? req.query.search[0] : req.query.search;
		const search = String(searchValue || '').trim();
		if (search.length > MAX_SEARCH_QUERY_LENGTH) {
			return res.status(400).json({ message: `Search query must not exceed ${MAX_SEARCH_QUERY_LENGTH} characters.` });
		}

		const matchQuery = { 'participants.userId': myId, type: 'group' };
		if (cursor) {
			const d = new Date(cursor);
			if (!isNaN(d.getTime())) matchQuery.updatedAt = { $lt: d };
		}
		if (search) {
			matchQuery['group.name'] = { $regex: escapeRegex(search), $options: 'i' };
		}

		let rawGroups = await Conversation.find(matchQuery)
			.sort({ updatedAt: -1 })
			.limit(limit + 1)
			.populate('participants.userId', PARTICIPANT_SELECT)
			.populate('lastMessage.senderId', MESSAGE_SENDER_SELECT)
			.lean();

		const hasMore = rawGroups.length > limit;
		if (hasMore) rawGroups.pop();
		const nextCursor = hasMore && rawGroups.length > 0
			? rawGroups[rawGroups.length - 1].updatedAt
			: null;

		const formatted = decryptConversationsPayload(rawGroups).map((c) => {
			const myParticipant = c.participants?.find((p) => {
				const pid = p?.userId?._id?.toString?.() || p?.userId?.toString?.();
				return pid === myId;
			});
			const pinnedAt = myParticipant?.pinnedAt
				? new Date(myParticipant.pinnedAt).toISOString()
				: null;

			return {
				...c,
				isPinned: !!pinnedAt,
				pinnedAt,
				participants: c.participants.map((p) => {
					let userObj = p.userId;
					if (!userObj && p.userInfo) {
						userObj = {
							_id: null,
							displayName: p.userInfo.displayName || 'Người dùng đã xóa',
							avatarUrl: p.userInfo.avatarUrl || null,
						};
					} else if (!userObj) {
						userObj = { _id: null, displayName: 'Người dùng đã xóa', avatarUrl: null };
					}
					return { ...p, userId: sanitizeParticipantUser(userObj) };
				}),
				unreadCounts: c.unreadCounts || {},
			};
		});

		return res.status(200).json({ groups: formatted, hasMore, nextCursor });
	} catch (error) {
		console.error('Error fetching groups:', error);
		return res.status(500).json({ message: 'Internal server error' });
	}
}

export async function getMessages(req, res) {
	try {
		const { conversationId } = req.params;
		const { limit = 50, cursor, before, after, aroundId } = req.query;
		const userId = req.user._id.toString();

		const conversation = await Conversation.findById(conversationId).select('participants').lean();
		if (!conversation) {
			return res.status(404).json({ message: "Conversation not found" });
		}

		const me = conversation.participants?.find(p => p.userId.toString() === userId);
		if (!me) {
			return res.status(403).json({ message: "You are not a participant in this conversation." });
		}
		const clearedAt = me?.clearedAt ? new Date(me.clearedAt) : null;

		const baseFilter = {
			conversationId,
			$or: [
				{ 'metadata.visibleToUserIds': { $exists: false } },
				{ 'metadata.visibleToUserIds': { $size: 0 } },
				{ 'metadata.visibleToUserIds': userId },
			],
		};

		if (clearedAt) {
			baseFilter.createdAt = { $gt: clearedAt };
		}

		const fallbackSender = (msg) => {
			if (msg?.senderId) {
				msg.senderId = sanitizeParticipantUser(msg.senderId);
			}
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

		if (aroundId) {
			const mongoose = await import('mongoose');
			if (!mongoose.default.Types.ObjectId.isValid(aroundId)) {
				return res.status(400).json({ message: "Invalid aroundId" });
			}

			const anchor = await Message.findById(aroundId).lean();
			if (!anchor) {
				return res.status(404).json({ message: "Anchor message not found" });
			}
			if (anchor.conversationId.toString() !== conversationId) {
				return res.status(403).json({ message: "Message does not belong to this conversation" });
			}

			const requestedAroundLimit = Number(limit);
			const limitNumber = Math.max(1, Math.min(100, Number.isFinite(requestedAroundLimit) ? requestedAroundLimit : 50));
			const half = Math.floor(limitNumber / 2);

			const [olderMessages, newerMessages] = await Promise.all([
				Message.find({ ...baseFilter, createdAt: { $lt: anchor.createdAt } })
					.sort({ createdAt: -1 })
					.limit(half)
					.populate('senderId', MESSAGE_SENDER_SELECT)
					.populate({
						path: 'replyTo',
						select: '_id senderId type content fileName isRecalled reportStatus',
						populate: { path: 'senderId', select: 'displayName' },
					})
					.lean(),
				Message.find({ ...baseFilter, createdAt: { $gt: anchor.createdAt } })
					.sort({ createdAt: 1 })
					.limit(half)
					.populate('senderId', MESSAGE_SENDER_SELECT)
					.populate({
						path: 'replyTo',
						select: '_id senderId type content fileName isRecalled reportStatus',
						populate: { path: 'senderId', select: 'displayName' },
					})
					.lean(),
			]);

			const combined = [
				...olderMessages.reverse(),
				anchor,
				...newerMessages
			].map(fallbackSender);

			return res.status(200).json({
				messages: sanitizeMessages(combined),
				anchorId: aroundId,
				hasMoreOlder: olderMessages.length === half,
				hasMoreNewer: newerMessages.length === half,
			});
		}
		const requestedLimit = Number(limit);
		const limitNumber = Math.max(1, Math.min(100, Number.isFinite(requestedLimit) ? requestedLimit : 50));
		let query = { ...baseFilter };
		let sortDirection = -1; // Default: newest first

		const activeCursor = before || cursor; // 'cursor' is legacy for 'before'

		if (activeCursor) {
			query.createdAt = { ...query.createdAt, $lt: new Date(activeCursor) };
		} else if (after) {
			query.createdAt = { ...query.createdAt, $gt: new Date(after) };
			sortDirection = 1; // forward: oldest to newest
		}

		let messages = await Message.find(query)
			.sort({ createdAt: sortDirection })
			.limit(limitNumber + 1)
			.populate('senderId', MESSAGE_SENDER_SELECT)
			.populate({
				path: 'replyTo',
				select: '_id senderId type content fileName isRecalled reportStatus',
				populate: { path: 'senderId', select: 'displayName' },
			})
			.lean();

		let hasMore = false;
		if (messages.length > limitNumber) {
			hasMore = true;
			messages.pop();
		}

		if (sortDirection === -1) {
			messages = messages.reverse();
		}

		messages = sanitizeMessages(messages.map(fallbackSender));

		// Handle pinned messages (only for initial load or backward pagination)
		let safePinnedMessages = [];
		if (!after) {
			const pinnedQuery = {
				conversationId: baseFilter.conversationId,
				isPinned: true,
				$or: baseFilter.$or,
			};
			if (clearedAt) {
				pinnedQuery.createdAt = { $gt: clearedAt };
			}

			const pinnedMessages = await Message.find(pinnedQuery)
				.sort({ pinnedAt: -1, createdAt: -1 })
				.populate('senderId', MESSAGE_SENDER_SELECT)
				.populate({
					path: 'replyTo',
					select: '_id senderId type content fileName isRecalled reportStatus',
					populate: { path: 'senderId', select: 'displayName' },
				})
				.lean();
			safePinnedMessages = sanitizeMessages(pinnedMessages.map(fallbackSender));
		}

		return res.status(200).json({
			messages,
			hasMore,
			nextCursor: (sortDirection === -1 && hasMore && messages.length > 0) ? messages[0].createdAt : null,
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


		const latestMessage = await Message.findOne({ conversationId }).sort({ createdAt: -1 }).select('_id').lean();
		if (!latestMessage) {
			return res.status(200).json({ message: "No messages in conversation" });
		}

		const now = new Date();
		const updated = await Conversation.findOneAndUpdate(
			{ _id: conversationId, 'participants.userId': userId },
			{
				$set: {
					[`unreadCounts.${userId}`]: 0,
					'participants.$.unreadMentionCount': 0,
					'participants.$.lastReadMessageId': latestMessage._id,
					'participants.$.lastReadAt': now,
				},
			},
			{ new: true }
		);

		if (!updated) {
			return res.status(404).json({ message: "Conversation not found" });
		}

		const readMessagePayload = {
			conversationId: conversationId,
			userId: userId,
			lastReadMessageId: latestMessage._id,
			lastReadAt: now.toISOString(),
			unreadCount: 0,
			unreadMentionCount: 0,
		};

		if (updated.type === 'direct') {
			const otherParticipant = updated.participants.find(p => p.userId.toString() !== userId);
			if (otherParticipant) {
				const blockExists = await BlockUser.findOne({
					$or: [
						{ from: userId, to: otherParticipant.userId },
						{ from: otherParticipant.userId, to: userId }
					]
				});
				if (blockExists) {
					// Only emit to self personal room to sync devices
					io.to(`user:${userId}`).emit("read-message", readMessagePayload);
					return res.status(200).json({
						message: "Conversation marked as seen",
						lastReadMessageId: latestMessage._id,
						myunreadCount: 0,
					});
				}
			}
		}

		io.to(conversationId).emit("read-message", readMessagePayload);

		return res.status(200).json({
			message: "Conversation marked as seen",
			lastReadMessageId: latestMessage._id,
			myunreadCount: 0,
		});

	} catch (error) {
		console.error("An error occurred while marking conversation as seen: ", error);
		return res.status(500).json({ message: "Internal server error" });
	}
}

export async function markAsUnread(req, res) {
	try {
		const { conversationId } = req.params;
		const userId = req.user._id.toString();

		const conversation = await Conversation.findOne({
			_id: conversationId,
			'participants.userId': userId,
		}).lean();
		if (!conversation) {
			return res.status(404).json({ message: "Conversation not found" });
		}

		const updated = await Conversation.findOneAndUpdate(
			{
				_id: conversationId,
				'participants.userId': userId,
			},
			{
				$set: { [`unreadCounts.${userId}`]: 1 },
			},
			{ new: true }
		);

		if (!updated) {
			return res.status(404).json({ message: "Conversation not found" });
		}

		const receiverSocketId = getReceiverSocketId(userId);
		if (receiverSocketId) {
			io.to(receiverSocketId).emit('conversation-updated', {
				conversationId: updated._id,
				conversation: { _id: updated._id, unreadCounts: updated.unreadCounts }
			});
		}

		return res.status(200).json({
			message: "Conversation marked as unread",
			myunreadCount: 1,
		});

	} catch (error) {
		console.error("An error occurred while marking conversation as unread: ", error);
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
		if (!wasPinned) {
			const pinnedCount = await Conversation.countDocuments({
				participants: {
					$elemMatch: {
						userId,
						pinnedAt: { $ne: null },
					},
				},
			});

			if (pinnedCount >= MAX_PINNED_CONVERSATIONS) {
				return res.status(400).json({
					message: `Bạn chỉ có thể ghim tối đa ${MAX_PINNED_CONVERSATIONS} cuộc hội thoại.`,
				});
			}
		}

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

export async function updateConversationMute(req, res) {
	try {
		const { conversationId } = req.params;
		const { target, duration } = req.body;
		const userId = req.user._id;

		const validTargets = ['messages', 'meetings', 'both'];
		const validDurations = ['1h', '8h', '24h', 'forever', 'off'];

		if (!validTargets.includes(target) || !validDurations.includes(duration)) {
			return res.status(400).json({
				message: 'Invalid target or duration. target: messages|meetings|both, duration: 1h|8h|24h|forever|off',
			});
		}

		let until = null;
		if (duration === 'forever') {
			until = new Date('9999-12-31');
		} else if (duration !== 'off') {
			until = new Date(Date.now() + MUTE_DURATION_MS[duration]);
		}

		const updatePayload = {};
		if (target === 'messages' || target === 'both') {
			updatePayload['participants.$.mute.messages'] = until;
		}
		if (target === 'meetings' || target === 'both') {
			updatePayload['participants.$.mute.meetings'] = until;
		}

		const query = {
			_id: conversationId,
			'participants.userId': userId,
		};

		const result = await Conversation.updateOne(query, {
			$set: updatePayload,
		});

		if (!result.matchedCount) {
			return res.status(404).json({ message: 'Conversation not found or you are not a participant.' });
		}

		const updatedConversation = await Conversation.findOne(query, { 'participants.$': 1 }).lean();
		const mute = updatedConversation?.participants?.[0]?.mute || {};
		const payload = {
			conversationId,
			userId: userId.toString(),
			mute: {
				messages: mute.messages || null,
				meetings: mute.meetings || null,
			},
		};

		const receiverSocketId = getReceiverSocketId(userId.toString());
		if (receiverSocketId) {
			io.to(receiverSocketId).emit('conversation-mute-updated', payload);
		}

		return res.status(200).json({
			mute: payload.mute,
		});
	} catch (error) {
		console.error('Error updating conversation mute:', error);
		return res.status(500).json({ message: 'Internal server error' });
	}
}

export async function getMediaByType(req, res) {
	try {
		const { conversationId } = req.params;
		const { type, limit = 8, cursor } = req.query;
		const userId = req.user._id.toString();

		const allowedTypes = ['image', 'file', 'link'];
		if (!type || !allowedTypes.includes(type)) {
			return res.status(400).json({ message: 'Invalid type. Must be one of: image, file, link' });
		}

		const conversation = await Conversation.findById(conversationId).select('participants').lean();
		if (!conversation) {
			return res.status(404).json({ message: 'Conversation not found' });
		}

		const me = conversation.participants?.find((p) => p.userId.toString() === userId);
		if (!me) {
			return res.status(403).json({ message: 'You are not a participant in this conversation.' });
		}

		const query = {
			conversationId,
			isRecalled: { $ne: true },
			reportStatus: { $ne: true },
			$or: [
				{ 'metadata.visibleToUserIds': { $exists: false } },
				{ 'metadata.visibleToUserIds': { $size: 0 } },
				{ 'metadata.visibleToUserIds': userId },
			],
		};

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

		if (me.clearedAt) {
			query.createdAt = { $gt: new Date(me.clearedAt) };
		}

		if (cursor) {
			query.createdAt = { ...query.createdAt, $lt: new Date(cursor) };
		}

		const numLimit = clampPageLimit(limit, 8, 100);
		let messages = await Message.find(query)
			.sort({ createdAt: -1 })
			.limit(numLimit + 1)
			.lean();

		let nextCursor = null;
		if (messages.length > numLimit) {
			nextCursor = messages[messages.length - 1].createdAt;
			messages.pop();
		}

		messages = decryptMessagesPayload(messages);

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
		const normalizedName = name.trim();
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
		const canUpdateGroupInfo = isGroupAdmin(conversation, userId) || conversation.group?.allowMembersChangeAvatar !== false;
		if (!canUpdateGroupInfo) {
			return res.status(403).json({ message: 'Chỉ quản trị viên mới có thể đổi tên hoặc ảnh nhóm lúc này.' });
		}

		const oldName = (conversation.group?.name || '').trim();
		if (oldName === normalizedName) {
			return res.status(200).json({
				success: true,
				message: 'Group name unchanged.',
			});
		}

		conversation.group.name = normalizedName;

		const systemMessage = new Message({
			conversationId,
			senderId: req.user._id,
			senderInfo: {
				displayName: req.user.displayName,
				avatarUrl: req.user.avatarUrl,
			},
			type: 'system',
			systemType: 'group_name_updated',
			metadata: {
				updatedBy: req.user._id,
				updatedByName: req.user.displayName,
				oldName,
				newName: normalizedName,
			},
			content: `${req.user.displayName} đã đổi tên nhóm thành ${normalizedName}`,
		});

		const savedMsg = await systemMessage.save();
		const finalMsg = await Message.findById(savedMsg._id).populate('senderId', MESSAGE_SENDER_SELECT);

		updateConversationLastMessage(conversation, finalMsg, req.user._id);
		await conversation.save();

		const updatedConversation = sanitizePopulatedConversation(await Conversation.findById(conversationId).populate({
			path: 'participants.userId',
			select: CLIENT_PARTICIPANT_SELECT,
		}));

		emitNewMessage(io, updatedConversation, finalMsg);

		io.to(conversationId.toString()).emit('conversation-updated', {
			conversationId,
			conversation: updatedConversation,
		});

		return res.status(200).json({
			success: true,
			message: 'Group name updated successfully',
			conversation: updatedConversation,
		});
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

		if (!isConversationParticipant(conversation, userId)) {
			return res.status(403).json({ message: 'Only group participants can update group avatar.' });
		}

		const canUpdateGroupInfo = isGroupAdmin(conversation, userId) || conversation.group?.allowMembersChangeAvatar !== false;
		if (!canUpdateGroupInfo) {
			return res.status(403).json({ message: 'Chỉ quản trị viên mới có thể đổi tên hoặc ảnh nhóm lúc này.' });
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
		const finalMsg = await Message.findById(savedMsg._id).populate('senderId', MESSAGE_SENDER_SELECT);

		updateConversationLastMessage(conversation, finalMsg, req.user._id);
		await conversation.save();

		if (previousAvatarId && previousAvatarId !== uploadResult.public_id) {
			try {
				await deleteCloudinaryResource(previousAvatarId, 'image');
			} catch (error) {
				console.warn('Delete old group avatar warning:', error?.message || error);
			}
		}

		const updatedConversation = sanitizePopulatedConversation(await Conversation.findById(conversationId).populate({
			path: 'participants.userId',
			select: CLIENT_PARTICIPANT_SELECT,
		}));

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
	conversation.disbandedAt = new Date();

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
	const finalMsg = await Message.findById(savedMsg._id).populate('senderId', MESSAGE_SENDER_SELECT);


	updateConversationLastMessage(conversation, finalMsg, adminUser._id);
	await conversation.save();

	const cleanupResult = await queueDisbandCleanup(conversation);

	io.to(conversation._id.toString()).emit('group-disbanded', { conversationId: conversation._id });
	emitNewMessage(io, conversation, finalMsg);
	return cleanupResult;
}

async function queueDisbandCleanup(conversation) {
	conversation.cleanup = {
		...(conversation.cleanup?.toObject?.() || conversation.cleanup || {}),
		status: 'queued',
		queuedAt: new Date(),
		error: undefined,
		failedAt: undefined,
	};

	try {
		const cleanupJob = await enqueueGroupCleanup(conversation._id);
		if (cleanupJob?.id) {
			conversation.cleanup.jobId = cleanupJob.id.toString();
		}
		await conversation.save();
		return { status: 'queued', job: cleanupJob };
	} catch (error) {
		conversation.cleanup.status = 'failed';
		conversation.cleanup.failedAt = new Date();
		conversation.cleanup.error = error?.message || 'Cannot enqueue cleanup job';
		await conversation.save();
		return { status: 'failed', error: conversation.cleanup.error };
	}
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

		if (conversation.disbanded === true) {
			const cleanupStatus = conversation.cleanup?.status || 'idle';
			if (['idle', 'failed'].includes(cleanupStatus)) {
				const cleanupResult = await queueDisbandCleanup(conversation);
				return res.status(202).json({
					message: cleanupResult?.status === 'queued'
						? 'Group already disbanded. Cleanup job queued.'
						: 'Group already disbanded. Cleanup job will be retried when Redis is available.',
					cleanupStatus: cleanupResult?.status || 'failed',
				});
			}

			return res.status(200).json({
				message: 'Group already disbanded.',
				cleanupStatus,
			});
		}

		const cleanupResult = await disbandGroup(conversation, req.user);
		res.status(202).json({
			message: cleanupResult?.status === 'queued'
				? 'Group disbanded. Cleanup job queued.'
				: 'Group disbanded. Cleanup job will be retried when Redis is available.',
			cleanupStatus: cleanupResult?.status || 'failed',
		});
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

		const cleanupBefore = getClearCleanupCutoff(conversation);
		if (cleanupBefore) {
			enqueueConversationClearCleanup(conversation._id, cleanupBefore).catch((cleanupError) => {
				console.error('[ConversationClearCleanupQueue] Cannot enqueue cleanup job:', cleanupError?.message || cleanupError);
			});
		}

		const receiverSocketId = getReceiverSocketId(userId.toString());
		if (receiverSocketId) {
			io.to(receiverSocketId).emit('conversation-cleared', { conversationId });
		}

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
		const membersToAdd = await User.find({ _id: { $in: filteredUserIds } }).select('displayName avatarUrl lock');
		const lockedMembers = membersToAdd.filter((member) => member.lock?.isLocked);
		if (lockedMembers.length > 0) {
			return res.status(423).json({ message: 'Không thể thêm tài khoản đã bị khóa vào nhóm.' });
		}

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
			{ path: 'participants.userId', select: CLIENT_PARTICIPANT_SELECT },
			{ path: 'lastMessage.senderId', select: MESSAGE_SENDER_SELECT }
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
		const finalMsg = await Message.findById(savedMsg._id).populate('senderId', MESSAGE_SENDER_SELECT);


		updateConversationLastMessage(conversation, finalMsg, currentUserId);
		await conversation.save();

		// Refresh and populate to ensure full info for socket emit
		const updatedConversation = sanitizePopulatedConversation(await Conversation.findById(conversationId).populate({
			path: 'participants.userId',
			select: CLIENT_PARTICIPANT_SELECT
		}));

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
				joinUserSocketsToRoom(newMemberId.toString(), conversationId.toString());
				io.to(receiverSocketId).emit("new-conversation", { conversation: updatedConversation });
			}
		});

		return res.status(200).json({
			success: true,
			conversation: sanitizePopulatedConversation(conversation)
		});

	} catch (error) {
		console.error('Error adding members:', error);
		res.status(500).json({ message: 'Internal server error' });
	}
}

export async function updateSettings(req, res) {
	try {
		const { conversationId } = req.params;
		const {
			isApprovalRequired,
			allowMembersChangeAvatar,
			allowMembersCreateSharedReminder,
		} = req.body;
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
		if (allowMembersChangeAvatar !== undefined) {
			conversation.group.allowMembersChangeAvatar = Boolean(allowMembersChangeAvatar);
		}
		if (allowMembersCreateSharedReminder !== undefined) {
			conversation.group.allowMembersCreateSharedReminder = Boolean(allowMembersCreateSharedReminder);
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
			const finalMsg = await Message.findById(savedMsg._id).populate('senderId', MESSAGE_SENDER_SELECT);

			updateConversationLastMessage(conversation, finalMsg, userId);
			await conversation.save();

			const updatedConversation = sanitizePopulatedConversation(await Conversation.findById(conversationId).populate({
				path: 'participants.userId',
				select: CLIENT_PARTICIPANT_SELECT
			}));

			emitNewMessage(io, updatedConversation, finalMsg);
		}

		if (allowMembersChangeAvatar !== undefined) {
			const canMembersChangeAvatar = Boolean(allowMembersChangeAvatar);
			const systemMessage = new Message({
				conversationId,
				senderId: userId,
				senderInfo: { displayName: req.user.displayName, avatarUrl: req.user.avatarUrl },
				type: 'system',
				systemType: 'group_avatar_permission_changed',
				metadata: {
					changedBy: userId,
					changedByName: req.user.displayName,
					allowMembersChangeAvatar: canMembersChangeAvatar,
				},
				content: canMembersChangeAvatar
					? `Đã bật quyền cho thành viên đổi tên và ảnh nhóm`
					: `Đã tắt quyền cho thành viên đổi tên và ảnh đại diện nhóm`
			});

			const savedMsg = await systemMessage.save();
			const finalMsg = await Message.findById(savedMsg._id).populate('senderId', MESSAGE_SENDER_SELECT);

			updateConversationLastMessage(conversation, finalMsg, userId);
			await conversation.save();

			const updatedConversation = sanitizePopulatedConversation(await Conversation.findById(conversationId).populate({
				path: 'participants.userId',
				select: CLIENT_PARTICIPANT_SELECT
			}));

			emitNewMessage(io, updatedConversation, finalMsg);
		}

		if (allowMembersCreateSharedReminder !== undefined) {
			const canMembersCreateSharedReminder = Boolean(allowMembersCreateSharedReminder);
			const systemMessage = new Message({
				conversationId,
				senderId: userId,
				senderInfo: { displayName: req.user.displayName, avatarUrl: req.user.avatarUrl },
				type: 'system',
				systemType: 'shared_reminder_permission_changed',
				metadata: {
					changedBy: userId,
					changedByName: req.user.displayName,
					allowMembersCreateSharedReminder: canMembersCreateSharedReminder,
				},
				content: canMembersCreateSharedReminder
					? `Đã bật quyền cho thành viên tạo nhắc hẹn chung`
					: `Đã tắt quyền cho thành viên tạo nhắc hẹn chung`
			});

			const savedMsg = await systemMessage.save();
			const finalMsg = await Message.findById(savedMsg._id).populate('senderId', MESSAGE_SENDER_SELECT);

			updateConversationLastMessage(conversation, finalMsg, userId);
			await conversation.save();

			const updatedConversation = sanitizePopulatedConversation(await Conversation.findById(conversationId).populate({
				path: 'participants.userId',
				select: CLIENT_PARTICIPANT_SELECT
			}));

			emitNewMessage(io, updatedConversation, finalMsg);
		}

		const updatedConversation = sanitizePopulatedConversation(await Conversation.findById(conversationId).populate({
			path: 'participants.userId',
			select: CLIENT_PARTICIPANT_SELECT
		}));

		io.to(conversationId.toString()).emit('conversation-updated', {
			conversationId,
			conversation: updatedConversation,
		});

		return res.status(200).json({
			success: true,
			message: 'Settings updated successfully.',
			group: updatedConversation.group,
			conversation: updatedConversation,
		});
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
				const memberToAdd = await User.findById(userId).select('displayName avatarUrl lock');
				const addedByUser = sanitizeParticipantUser(await User.findById(originalAddedById).select('displayName avatarUrl lock'));
				if (memberToAdd) {
					if (memberToAdd.lock?.isLocked) {
						return res.status(423).json({ message: 'Không thể duyệt tài khoản đã bị khóa vào nhóm.' });
					}
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
					const finalMsg = await Message.findById(savedMsg._id).populate('senderId', MESSAGE_SENDER_SELECT);

					updateConversationLastMessage(conversation, finalMsg, currentUserId);
					await conversation.save();

					const updatedConversation = sanitizePopulatedConversation(await Conversation.findById(conversationId).populate({
						path: 'participants.userId',
						select: CLIENT_PARTICIPANT_SELECT
					}));

					emitNewMessage(io, updatedConversation, finalMsg);
					io.to(conversationId.toString()).emit('members-added', { conversationId, conversation: updatedConversation });

					const receiverSocketId = getReceiverSocketId(userId.toString());
					if (receiverSocketId) {
						joinUserSocketsToRoom(userId.toString(), conversationId.toString());
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
			.populate('group.approvalQueue.userId', 'displayName avatarUrl email lock')
			.populate('group.approvalQueue.addedBy', 'displayName avatarUrl lock');

		if (!conversation) return res.status(404).json({ message: 'Conversation not found.' });
		if (conversation.type !== 'group') return res.status(400).json({ message: 'Not a group.' });
		if (!conversation.group.admins.some(adminId => adminId.toString() === userId)) {
			return res.status(403).json({ message: 'Only admins can view the queue.' });
		}

		const queue = conversation.group.approvalQueue.map((item) => {
			const raw = item.toObject?.() || item;
			return {
				...raw,
				userId: sanitizeParticipantUser(item.userId),
				addedBy: sanitizeParticipantUser(item.addedBy),
			};
		});

		return res.status(200).json({ success: true, queue });
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
		const kickedUser = sanitizeParticipantUser(await User.findById(memberId).select('displayName avatarUrl lock'));
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
		const finalMsg = await Message.findById(savedMsg._id).populate('senderId', MESSAGE_SENDER_SELECT);

		updateConversationLastMessage(conversation, finalMsg, adminId);
		await conversation.save();

		const updatedConversation = sanitizePopulatedConversation(await Conversation.findById(conversationId).populate({
			path: 'participants.userId',
			select: CLIENT_PARTICIPANT_SELECT
		}));

		emitNewMessage(io, updatedConversation, finalMsg);

		io.to(conversationId.toString()).emit('member-removed', {
			conversationId,
			conversation: updatedConversation,
			removedUserId: memberId
		});

		const receiverSocketId = getReceiverSocketId(memberId.toString());
		if (receiverSocketId) {
			leaveUserSocketsFromRoom(memberId.toString(), conversationId.toString());
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

	const newAdmin = sanitizeParticipantUser(await User.findById(newAdminId).select('displayName avatarUrl lock'));

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

		const targetAdmin = await User.findById(memberId).select('lock').lean();
		if (targetAdmin?.lock?.isLocked) {
			return res.status(423).json({ message: 'Không thể chuyển quyền trưởng nhóm cho tài khoản đã bị khóa.' });
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
		const finalMsg = await Message.findById(savedMsg._id).populate('senderId', MESSAGE_SENDER_SELECT);

		updateConversationLastMessage(conversation, finalMsg, req.user._id);
		await conversation.save();

		const updatedConversation = sanitizePopulatedConversation(await Conversation.findById(conversationId).populate({
			path: 'participants.userId',
			select: CLIENT_PARTICIPANT_SELECT
		}));

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
			const promotedAdminUser = await User.findById(newAdminParticipant.userId).select('displayName avatarUrl lock');
			if (promotedAdminUser?.lock?.isLocked) {
				return res.status(423).json({ message: 'Không thể chuyển quyền trưởng nhóm cho tài khoản đã bị khóa.' });
			}
			const safePromotedAdminUser = sanitizeParticipantUser(promotedAdminUser);
			promotedAdminName =
				newAdminParticipant.userInfo?.displayName ||
				safePromotedAdminUser?.displayName ||
				'Một thành viên';
			promotedAdminAvatarUrl =
				newAdminParticipant.userInfo?.avatarUrl ||
				safePromotedAdminUser?.avatarUrl ||
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
			const finalLeaveMsg = await Message.findById(savedLeaveMsg._id).populate('senderId', MESSAGE_SENDER_SELECT);
			updateConversationLastMessage(conversation, finalLeaveMsg, userId);
			await conversation.save();

			const updatedConversationForLeave = sanitizePopulatedConversation(await Conversation.findById(conversationId).populate({
				path: 'participants.userId',
				select: CLIENT_PARTICIPANT_SELECT
			}));

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
				const finalTransferMsg = await Message.findById(savedTransferMsg._id).populate('senderId', MESSAGE_SENDER_SELECT);
				updateConversationLastMessage(conversation, finalTransferMsg, userId);
				await conversation.save();

				const updatedConversationForTransfer = sanitizePopulatedConversation(await Conversation.findById(conversationId).populate({
					path: 'participants.userId',
					select: CLIENT_PARTICIPANT_SELECT
				}));

				emitNewMessage(io, updatedConversationForTransfer, finalTransferMsg);
			}
		} else {
			await conversation.save();
		}

		const updatedConversation = sanitizePopulatedConversation(await Conversation.findById(conversationId).populate({
			path: 'participants.userId',
			select: CLIENT_PARTICIPANT_SELECT
		}));

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
			const finalSilentMsg = await Message.findById(savedSilentMsg._id).populate('senderId', MESSAGE_SENDER_SELECT);

			const payloadMessage = decryptMessagePayload(finalSilentMsg);
			const safeUpdatedConversation = decryptConversationPayload(updatedConversation);
			const lastMsgPayload = safeUpdatedConversation.lastMessage
				? { ...safeUpdatedConversation.lastMessage }
				: safeUpdatedConversation.lastMessage;

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
			leaveUserSocketsFromRoom(userId, conversationId.toString());
			io.to(userSocketId).emit('left-group', { conversationId });
		}

		return res.status(200).json({ success: true, message: 'Rời nhóm thành công.' });
	} catch (error) {
		console.error('Error leaving group:', error);
		res.status(500).json({ message: 'Internal server error' });
	}
}
