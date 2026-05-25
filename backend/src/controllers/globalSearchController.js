import mongoose from 'mongoose';
import User from '../models/userModel.js';
import BlockUser from '../models/blockUserModel.js';
import Conversation from '../models/conversationModel.js';
import Message from '../models/messageModel.js';
import Friend from '../models/friendModel.js';
import { normalizeVietnamese } from '../utils/vietnameseHelper.js';
import { decryptConversationPayload, decryptMessagePayload } from '../utils/messageCrypto.js';
import { maskLockedUser } from '../utils/lockedUser.js';
import { applyProfileVisibility } from '../utils/profilePrivacy.js';

const MAX_SEARCH_QUERY_LENGTH = 100;
const DEFAULT_USER_LIMIT = 5;
const DEFAULT_CONVERSATION_LIMIT = 8;
const DEFAULT_MESSAGE_LIMIT = 10;
const MAX_GROUP_LIMIT = 20;
const MAX_SCANNED_MESSAGES = 800;
const MAX_SCANNED_CONVERSATIONS = 200;
const SEARCH_TYPES = new Set(['all', 'users', 'conversations', 'messages']);

const PARTICIPANT_SELECT = 'displayName avatarUrl profileVisibility lock';
const MESSAGE_SENDER_SELECT = 'displayName avatarUrl lock';

function clampLimit(value, defaultLimit) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return defaultLimit;
    return Math.max(1, Math.min(MAX_GROUP_LIMIT, parsed));
}

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function encodeCursor(payload) {
    if (!payload) return null;
    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

function decodeCursor(value) {
    if (!value || typeof value !== 'string') return null;

    try {
        const decoded = JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
        return decoded && typeof decoded === 'object' ? decoded : null;
    } catch {
        return null;
    }
}

function toObjectId(value) {
    if (!value || !mongoose.Types.ObjectId.isValid(value)) return null;
    return new mongoose.Types.ObjectId(value);
}

function buildObjectIdCursorFilter(cursor) {
    const decodedCursor = decodeCursor(cursor);
    const cursorId = toObjectId(decodedCursor?.id || cursor);
    return cursorId ? { _id: { $gt: cursorId } } : {};
}

function buildDateIdCursor(doc, dateField) {
    const dateValue = doc?.[dateField];
    const id = getIdString(doc);

    if (!dateValue || !id) return null;

    return encodeCursor({
        at: new Date(dateValue).toISOString(),
        id,
    });
}

function buildDateIdCursorFilter(cursor, dateField) {
    const decodedCursor = decodeCursor(cursor);
    if (!decodedCursor?.at || !decodedCursor?.id) return null;

    const date = new Date(decodedCursor.at);
    const id = toObjectId(decodedCursor.id);

    if (Number.isNaN(date.getTime()) || !id) return null;

    return {
        $or: [
            { [dateField]: { $lt: date } },
            { [dateField]: date, _id: { $lt: id } },
        ],
    };
}

function toPage(items, limit, hasMore, nextCursor) {
    return {
        items,
        limit,
        hasMore: Boolean(hasMore),
        nextCursor: hasMore ? nextCursor || null : null,
    };
}

function emptyPage(limit) {
    return toPage([], limit, false, null);
}

function getRequestedType(rawType) {
    const type = String(rawType || 'all').toLowerCase();
    return SEARCH_TYPES.has(type) ? type : null;
}

function getCursorForType(req, type) {
    const cursorParams = {
        users: 'userCursor',
        conversations: 'conversationCursor',
        messages: 'messageCursor',
    };

    return req.query.cursor || req.query[cursorParams[type]] || null;
}

function getLimitForType(req, requestedType, type, defaultLimit, queryKey) {
    const rawLimit = requestedType === type
        ? (req.query.limit || req.query[queryKey])
        : req.query[queryKey];

    return clampLimit(rawLimit, defaultLimit);
}

function getIdString(value) {
    return value?._id?.toString?.() || value?.toString?.() || '';
}

function metadataObject(value) {
    if (value instanceof Map) return Object.fromEntries(value);
    return value || {};
}

function getSystemMessageSearchText(message, currentUserId) {
    if (message.type !== 'system') return message.content || message.fileName || '';

    const metadata = metadataObject(message.metadata);
    const systemType = message.systemType;
    const myId = currentUserId.toString();
    const isMe = (value) => value?.toString?.() === myId || String(value || '') === myId;
    const nameOrFallback = (value, fallback) => String(value || fallback || '').trim();

    switch (systemType) {
        case 'member_added': {
            const addedBy = metadata.addedBy;
            const addedUserIds = Array.isArray(metadata.addedUserIds) ? metadata.addedUserIds : [];
            const names = nameOrFallback(metadata.addedUserNames, 'thanh vien moi');
            const adderName = nameOrFallback(metadata.addedByName, 'Mot nguoi dung');

            if (isMe(addedBy)) return `Ban da them ${names} vao nhom`;
            if (addedUserIds.some((id) => isMe(id))) return `Ban da duoc ${adderName} them vao nhom`;
            return `${names} duoc ${adderName} them vao nhom`;
        }

        case 'member_kicked': {
            const kickedUserId = metadata.kickedUserId || metadata.removedUserId;
            const adminId = metadata.adminId || metadata.removedBy;
            const kickedName = nameOrFallback(metadata.kickedUserName || metadata.removedUserName, 'mot thanh vien');
            const adminName = nameOrFallback(metadata.adminName || metadata.removedByName, 'Quan tri vien');

            if (isMe(adminId)) return `Ban da xoa ${kickedName} khoi nhom`;
            if (isMe(kickedUserId)) return `Ban da bi xoa khoi nhom boi ${adminName}`;
            return `${adminName} da dua ${kickedName} ra khoi nhom`;
        }

        case 'member_left': {
            const leftUserId = metadata.leftUserId ?? metadata.userId;
            const userName = nameOrFallback(metadata.leftUserName ?? metadata.userName, 'Mot thanh vien');
            return isMe(leftUserId) ? 'Ban da roi khoi nhom' : `${userName} da roi khoi nhom`;
        }

        case 'group_avatar_updated': {
            const updatedBy = metadata.updatedBy;
            const updatedByName = nameOrFallback(metadata.updatedByName, 'Mot thanh vien');
            return isMe(updatedBy) ? 'Ban da doi anh dai dien nhom' : `${updatedByName} da doi anh dai dien nhom`;
        }

        case 'group_name_updated': {
            const updatedBy = metadata.updatedBy;
            const updatedByName = nameOrFallback(metadata.updatedByName, 'Mot thanh vien');
            const targetName = String(metadata.newName || '').trim();
            const actorName = isMe(updatedBy) ? 'Ban' : updatedByName;
            return targetName
                ? `${actorName} da doi ten nhom thanh ${targetName}`
                : `${actorName} da doi ten nhom`;
        }

        case 'group_disbanded':
            return isMe(metadata.disbandedBy) ? 'Ban da giai tan nhom' : 'Nhom da bi giai tan';

        case 'admin_transferred': {
            const appointedBy = metadata.appointedBy;
            const appointedUserId = metadata.appointedUserId;
            const appointedUserName = nameOrFallback(metadata.appointedUserInfo?.displayName, 'mot thanh vien');

            if (isMe(appointedBy)) return `Ban da chuyen quyen truong nhom cho ${appointedUserName}`;
            if (isMe(appointedUserId)) return 'Ban da tro thanh truong nhom moi';
            return `${appointedUserName} da tro thanh truong nhom moi`;
        }

        case 'message_pinned': {
            const actor = isMe(metadata.actionBy) ? 'Ban' : nameOrFallback(metadata.actionByName, 'Mot thanh vien');
            return `${actor} da ghim mot tin nhan`;
        }

        case 'message_unpinned': {
            const actor = isMe(metadata.actionBy) ? 'Ban' : nameOrFallback(metadata.actionByName, 'Mot thanh vien');
            return `${actor} da bo ghim mot tin nhan`;
        }

        case 'approval_mode_changed': {
            const actor = isMe(metadata.changedBy) ? 'Ban' : nameOrFallback(metadata.changedByName, 'Mot quan tri vien');
            return `${actor} da ${metadata.isApprovalRequired ? 'bat' : 'tat'} che do phe duyet thanh vien moi`;
        }

        case 'group_avatar_permission_changed': {
            const actor = isMe(metadata.changedBy) ? 'Ban' : nameOrFallback(metadata.changedByName, 'Mot quan tri vien');
            return `${actor} da ${metadata.allowMembersChangeAvatar ? 'bat' : 'tat'} quyen cho thanh vien doi ten va anh nhom`;
        }

        case 'reminder_created_local': {
            const reminderContent = String(metadata.reminderContent || '').trim();
            return reminderContent ? `Ban da tao nhac hen moi: ${reminderContent}` : 'Ban da tao nhac hen moi';
        }

        case 'shared_reminder_created': {
            const actor = isMe(metadata.creatorId) ? 'Ban' : nameOrFallback(metadata.creatorName, 'Mot thanh vien');
            const reminderContent = String(metadata.reminderContent || '').trim();
            return reminderContent ? `${actor} da tao nhac hen chung: ${reminderContent}` : `${actor} da tao nhac hen chung`;
        }

        case 'shared_reminder_participation_changed': {
            const actor = isMe(metadata.actorId) ? 'Ban' : nameOrFallback(metadata.actorName, 'Mot thanh vien');
            const action = String(metadata.action || '').trim().toLowerCase();
            const reminderContent = String(metadata.reminderContent || '').trim();
            const actionText = action === 'joined' ? 'tham gia' : action === 'declined' ? 'roi' : 'cap nhat';
            return reminderContent ? `${actor} da ${actionText} nhac hen: ${reminderContent}` : `${actor} da ${actionText} nhac hen`;
        }

        case 'shared_reminder_cancelled': {
            const actor = isMe(metadata.actorId) ? 'Ban' : nameOrFallback(metadata.actorName, 'Mot thanh vien');
            const reminderContent = String(metadata.reminderContent || '').trim();
            return reminderContent ? `${actor} da huy nhac hen chung: ${reminderContent}` : `${actor} da huy nhac hen chung`;
        }

        case 'shared_reminder_updated': {
            const actor = isMe(metadata.actorId) ? 'Ban' : nameOrFallback(metadata.actorName, 'Mot thanh vien');
            const reminderContent = String(metadata.reminderContent || '').trim();
            return reminderContent ? `${actor} da chinh sua nhac hen chung: ${reminderContent}` : `${actor} da chinh sua nhac hen chung`;
        }

        case 'call_started':
            return 'Cuoc goi da bat dau';
        case 'call_ended':
            return 'Cuoc goi da ket thuc';
        case 'call':
            return `${metadata.callType === 'video' ? 'Cuoc goi video' : 'Cuoc goi thoai'}${metadata.mode === 'group' ? ' nhom' : ''}`;

        default:
            return message.content || 'Thong bao he thong';
    }
}

function isVisibleByMetadata(messageLike, userId) {
    const metadata = metadataObject(messageLike?.metadata);
    const visibleToUserIds = Array.isArray(metadata.visibleToUserIds)
        ? metadata.visibleToUserIds.map((id) => id.toString())
        : [];
    return visibleToUserIds.length === 0 || visibleToUserIds.includes(userId);
}

function findMyParticipant(conversation, userId) {
    return (conversation?.participants || []).find((participant) => {
        const participantId = getIdString(participant?.userId);
        return participantId === userId;
    });
}

function isAfterClearedAt(value, clearedAt) {
    if (!clearedAt) return true;
    if (!value) return false;
    return new Date(value).getTime() > new Date(clearedAt).getTime();
}

function sanitizeParticipantUser(userObj) {
    if (!userObj) return userObj;
    return maskLockedUser(userObj);
}

function buildNicknameMap(friends, myId) {
    const nickMap = new Map();

    for (const friend of friends || []) {
        const userA = friend.userA.toString();
        const userB = friend.userB.toString();

        if (userA === myId) {
            nickMap.set(userB, friend.nicknameB || null);
        } else if (userB === myId) {
            nickMap.set(userA, friend.nicknameA || null);
        }
    }

    return nickMap;
}

async function resolveSafeLastMessage(rawConversation, myId, myParticipant) {
    const conversation = decryptConversationPayload(rawConversation);
    const clearedAt = myParticipant?.clearedAt ? new Date(myParticipant.clearedAt) : null;
    const lastMessage = conversation.lastMessage || null;

    if (
        lastMessage
        && isVisibleByMetadata(lastMessage, myId)
        && isAfterClearedAt(lastMessage.createdAt || conversation.updatedAt || conversation.createdAt, clearedAt)
    ) {
        return conversation;
    }

    const fallbackFilter = {
        conversationId: conversation._id,
        $or: [
            { 'metadata.visibleToUserIds': { $exists: false } },
            { 'metadata.visibleToUserIds': { $size: 0 } },
            { 'metadata.visibleToUserIds': myId },
        ],
    };

    if (clearedAt) {
        fallbackFilter.createdAt = { $gt: clearedAt };
    }

    const fallback = await Message.findOne(fallbackFilter)
        .sort({ createdAt: -1 })
        .populate('senderId', MESSAGE_SENDER_SELECT)
        .lean();

    if (!fallback) {
        return { ...conversation, lastMessage: null };
    }

    const safeFallback = decryptMessagePayload(fallback);
    return {
        ...conversation,
        lastMessage: {
            _id: safeFallback._id,
            content: safeFallback.content,
            type: safeFallback.type,
            systemType: safeFallback.systemType || null,
            metadata: metadataObject(safeFallback.metadata),
            createdAt: safeFallback.createdAt,
            senderId: safeFallback.senderId,
        },
    };
}

async function formatConversationForClient(rawConversation, myId, nickMap) {
    const rawMyParticipant = findMyParticipant(rawConversation, myId);
    const conversation = await resolveSafeLastMessage(rawConversation, myId, rawMyParticipant);
    const myParticipant = findMyParticipant(conversation, myId);
    const clearedAt = myParticipant?.clearedAt ? new Date(myParticipant.clearedAt) : null;

    if (clearedAt) {
        const compareTime = conversation.lastMessage?.createdAt || conversation.updatedAt || conversation.createdAt;
        if (!isAfterClearedAt(compareTime, clearedAt)) {
            return null;
        }
    }

    const pinnedAt = myParticipant?.pinnedAt
        ? new Date(myParticipant.pinnedAt).toISOString()
        : null;

    return {
        ...conversation,
        isPinned: Boolean(pinnedAt),
        pinnedAt,
        participants: (conversation.participants || []).map((participant) => {
            let userObj = participant.userId;

            if (!userObj && participant.userInfo) {
                userObj = {
                    _id: null,
                    displayName: participant.userInfo.displayName || 'Nguoi dung da xoa',
                    avatarUrl: participant.userInfo.avatarUrl || null,
                };
            } else if (!userObj) {
                userObj = {
                    _id: null,
                    displayName: 'Nguoi dung da xoa',
                    avatarUrl: null,
                };
            }

            userObj = sanitizeParticipantUser(userObj);
            const participantId = userObj?._id?.toString?.();
            const nickname = userObj?.isLocked
                ? null
                : (participantId && participantId !== myId ? nickMap.get(participantId) || null : null);

            return {
                ...participant,
                userId: {
                    ...userObj,
                    nickname,
                },
            };
        }),
        unreadCounts: conversation.unreadCounts || {},
    };
}

async function getBlockedIds(currentUserId) {
    const blocks = await BlockUser.find({
        $or: [
            { from: currentUserId },
            { to: currentUserId },
        ],
    }).lean();

    return blocks.map((block) => (
        block.from.toString() === currentUserId.toString() ? block.to : block.from
    ));
}

async function searchUsersForGlobal({ keyword, keywordRegex, currentUserId, blockedIds, friends, limit, cursor }) {
    const currentUserIdString = currentUserId.toString();
    const friendIds = (friends || []).map((friend) => {
        const userA = friend.userA.toString();
        const userB = friend.userB.toString();
        return userA === currentUserIdString ? friend.userB : friend.userA;
    });
    const nicknameMatchedFriendIds = (friends || [])
        .filter((friend) => {
            const userA = friend.userA.toString();
            const nickname = userA === currentUserIdString ? friend.nicknameB : friend.nicknameA;
            return nickname && keywordRegex.test(nickname);
        })
        .map((friend) => {
            const userA = friend.userA.toString();
            return userA === currentUserIdString ? friend.userB : friend.userA;
        });

    const roleFilter = [
        { role: 'user' },
        { role: { $exists: false } },
        { role: null },
    ];

    const searchClauses = [];
    if (friendIds.length > 0) {
        searchClauses.push({
            _id: { $in: friendIds },
            $or: [
                { displayName: keywordRegex },
                { email: keywordRegex },
                { phone: keywordRegex },
                ...(nicknameMatchedFriendIds.length > 0 ? [{ _id: { $in: nicknameMatchedFriendIds } }] : []),
            ],
        });
    }

    const exactEmail = keyword.trim().toLowerCase();
    if (exactEmail) {
        searchClauses.push({
            _id: { $nin: friendIds },
            email: exactEmail,
        });
    }

    if (searchClauses.length === 0) {
        return emptyPage(limit);
    }

    const cursorFilter = buildObjectIdCursorFilter(cursor);
    const idFilter = {
        ...(cursorFilter._id || {}),
        $nin: [
            currentUserId,
            ...blockedIds,
        ],
    };

    const rawUsers = await User.find({
        _id: idFilter,
        $or: roleFilter,
        $and: [{
            $or: searchClauses,
        }],
    })
        .select('_id displayName avatarUrl email phone bio music profileVisibility lock')
        .sort({ _id: 1 })
        .limit(limit + 1)
        .lean();

    const pageUsers = rawUsers.slice(0, limit);
    const hasMore = rawUsers.length > limit;
    const nextCursor = hasMore && pageUsers.length > 0
        ? getIdString(pageUsers[pageUsers.length - 1])
        : null;

    const friendIdSet = new Set(friendIds.map((id) => id.toString()));
    return toPage(pageUsers.map((user) => applyProfileVisibility(maskLockedUser(user), {
        viewerId: currentUserId,
        isFriend: friendIdSet.has(getIdString(user)),
    })), limit, hasMore, nextCursor);
}

async function getConversationMatchedUserIds(keywordRegex, currentUserId) {
    const matchedUsers = await User.find({
        _id: { $ne: currentUserId },
        $or: [
            { role: 'user' },
            { role: { $exists: false } },
            { role: null },
        ],
        $and: [{
                $or: [
                    { displayName: keywordRegex },
                    { email: keywordRegex },
                    { phone: keywordRegex },
                ],
        }],
    })
        .select('_id')
        .limit(50)
        .lean();

    return matchedUsers.map((user) => user._id);
}

async function getNicknameMatchedUserIds(keywordRegex, currentUserId) {
    const friends = await Friend.find({
        $or: [
            { userA: currentUserId, nicknameB: keywordRegex },
            { userB: currentUserId, nicknameA: keywordRegex },
        ],
    })
        .select('userA userB nicknameA nicknameB')
        .limit(50)
        .lean();

    const ids = new Set();
    for (const friend of friends) {
        const userA = friend.userA.toString();
        const userB = friend.userB.toString();
        if (userA === currentUserId.toString()) ids.add(userB);
        if (userB === currentUserId.toString()) ids.add(userA);
    }

    return [...ids].map((id) => new mongoose.Types.ObjectId(id));
}

async function searchConversationsForGlobal({ keywordRegex, currentUserId, limit, nickMap, cursor }) {
    const matchedUserIds = await getConversationMatchedUserIds(keywordRegex, currentUserId);
    const nicknameMatchedUserIds = await getNicknameMatchedUserIds(keywordRegex, currentUserId);
    const participantMatchedIds = [...matchedUserIds, ...nicknameMatchedUserIds];

    const matchClauses = [
        { 'group.name': keywordRegex },
        { 'participants.userInfo.displayName': keywordRegex },
    ];

    if (participantMatchedIds.length > 0) {
        matchClauses.push({ 'participants.userId': { $in: participantMatchedIds } });
    }

    const matches = [];
    const fetchSize = Math.min(Math.max(limit * 4, 20), 80);
    let scannedCount = 0;
    let scanCursor = cursor || null;
    let exhausted = false;

    while (matches.length <= limit && scannedCount < MAX_SCANNED_CONVERSATIONS && !exhausted) {
        const cursorFilter = buildDateIdCursorFilter(scanCursor, 'updatedAt');
        const andFilters = [{ $or: matchClauses }];
        if (cursorFilter) andFilters.push(cursorFilter);

        const batchSize = Math.min(fetchSize, MAX_SCANNED_CONVERSATIONS - scannedCount);
        const rawConversations = await Conversation.find({
            'participants.userId': currentUserId,
            disbanded: { $ne: true },
            $and: andFilters,
        })
            .sort({ updatedAt: -1, _id: -1 })
            .limit(batchSize)
            .populate('participants.userId', PARTICIPANT_SELECT)
            .populate('lastMessage.senderId', MESSAGE_SENDER_SELECT)
            .lean();

        scannedCount += rawConversations.length;

        if (!rawConversations.length) {
            exhausted = true;
            break;
        }

        const formatted = await Promise.all(
            rawConversations.map((conversation) => formatConversationForClient(conversation, currentUserId.toString(), nickMap))
        );

        for (let index = 0; index < formatted.length; index += 1) {
            if (!formatted[index]) continue;
            matches.push({
                item: formatted[index],
                cursor: buildDateIdCursor(rawConversations[index], 'updatedAt'),
            });
            if (matches.length > limit) break;
        }

        if (matches.length > limit) break;

        const lastScanned = rawConversations[rawConversations.length - 1];
        scanCursor = buildDateIdCursor(lastScanned, 'updatedAt');
        exhausted = rawConversations.length < batchSize;
    }

    const pageMatches = matches.slice(0, limit);
    const hasMore = matches.length > limit || (!exhausted && scannedCount >= MAX_SCANNED_CONVERSATIONS && pageMatches.length > 0);
    const nextCursor = hasMore && pageMatches.length > 0
        ? pageMatches[pageMatches.length - 1].cursor
        : null;

    return toPage(pageMatches.map((match) => match.item), limit, hasMore, nextCursor);
}

async function searchMessagesForGlobal({ currentUserId, normalizedKeyword, limit, nickMap, cursor }) {
    const accessibleConversations = await Conversation.find({
        'participants.userId': currentUserId,
        disbanded: { $ne: true },
    })
        .select('_id type group participants lastMessage unreadCounts updatedAt createdAt disbanded')
        .populate('participants.userId', PARTICIPANT_SELECT)
        .populate('lastMessage.senderId', MESSAGE_SENDER_SELECT)
        .lean();

    if (!accessibleConversations.length) return emptyPage(limit);

    const clearMap = new Map();
    const conversationMap = new Map();
    const conversationIds = accessibleConversations.map((conversation) => {
        const conversationId = conversation._id.toString();
        const myParticipant = findMyParticipant(conversation, currentUserId.toString());
        if (myParticipant?.clearedAt) {
            clearMap.set(conversationId, new Date(myParticipant.clearedAt));
        }
        conversationMap.set(conversationId, conversation);
        return conversation._id;
    });

    const baseFilter = {
        conversationId: { $in: conversationIds },
        isRecalled: { $ne: true },
        reportStatus: { $ne: true },
        $or: [
            { 'metadata.visibleToUserIds': { $exists: false } },
            { 'metadata.visibleToUserIds': { $size: 0 } },
            { 'metadata.visibleToUserIds': currentUserId.toString() },
        ],
    };

    const matched = [];
    let scannedCount = 0;
    let scanCursor = cursor || null;
    let exhausted = false;

    while (matched.length <= limit && scannedCount < MAX_SCANNED_MESSAGES && !exhausted) {
        const cursorFilter = buildDateIdCursorFilter(scanCursor, 'createdAt');
        const pageFilter = cursorFilter
            ? { $and: [baseFilter, cursorFilter] }
            : baseFilter;

        const batchSize = Math.min(Math.max(limit * 4, 20), MAX_SCANNED_MESSAGES - scannedCount);
        const rawMessages = await Message.find(pageFilter)
            .select('+searchContent')
            .sort({ createdAt: -1, _id: -1 })
            .limit(batchSize)
            .populate('senderId', MESSAGE_SENDER_SELECT)
            .lean();

        scannedCount += rawMessages.length;

        if (!rawMessages.length) {
            exhausted = true;
            break;
        }

        for (const rawMessage of rawMessages) {
            const message = decryptMessagePayload(rawMessage);
            const conversationId = getIdString(message.conversationId);
            const clearedAt = clearMap.get(conversationId);

            if (clearedAt && new Date(message.createdAt).getTime() <= clearedAt.getTime()) {
                continue;
            }

            const searchableText = message.type === 'system'
                ? normalizeVietnamese(getSystemMessageSearchText(message, currentUserId))
                : (message.searchContent || normalizeVietnamese(message.content || ''));

            if (!searchableText.includes(normalizedKeyword)) {
                continue;
            }

            const { searchContent, ...safeMessage } = message;
            if (safeMessage.senderId && typeof safeMessage.senderId === 'object') {
                safeMessage.senderId = sanitizeParticipantUser(safeMessage.senderId);
            }

            matched.push({
                item: safeMessage,
                conversationId,
                cursor: buildDateIdCursor(rawMessage, 'createdAt'),
            });

            if (matched.length > limit) break;
        }

        if (matched.length > limit) break;

        const lastScanned = rawMessages[rawMessages.length - 1];
        scanCursor = buildDateIdCursor(lastScanned, 'createdAt');
        exhausted = rawMessages.length < batchSize;
    }

    const pageMatches = matched.slice(0, limit);
    if (!pageMatches.length) return emptyPage(limit);

    const neededConversationIds = new Set(pageMatches.map((match) => match.conversationId));

    const formattedConversationEntries = await Promise.all(
        [...neededConversationIds].map(async (conversationId) => {
            const conversation = conversationMap.get(conversationId);
            if (!conversation) return [conversationId, null];
            return [
                conversationId,
                await formatConversationForClient(conversation, currentUserId.toString(), nickMap),
            ];
        })
    );
    const formattedConversationMap = new Map(formattedConversationEntries);

    const items = pageMatches
        .map((match) => ({
            ...match.item,
            conversation: formattedConversationMap.get(match.conversationId) || null,
        }))
        .filter((message) => Boolean(message.conversation));

    const hasMore = matched.length > limit || (!exhausted && scannedCount >= MAX_SCANNED_MESSAGES && items.length > 0);
    const nextCursor = hasMore && pageMatches.length > 0
        ? pageMatches[pageMatches.length - 1].cursor
        : null;

    return toPage(items, limit, hasMore, nextCursor);
}

export async function globalSearch(req, res) {
    try {
        const currentUserId = req.user._id;
        const keyword = String(req.query.keyword || req.query.q || '').trim();
        const requestedType = getRequestedType(req.query.type);

        if (!requestedType) {
            return res.status(400).json({
                message: 'Invalid search type. Supported types: all, users, conversations, messages.',
            });
        }

        const userLimit = getLimitForType(req, requestedType, 'users', DEFAULT_USER_LIMIT, 'userLimit');
        const conversationLimit = getLimitForType(req, requestedType, 'conversations', DEFAULT_CONVERSATION_LIMIT, 'conversationLimit');
        const messageLimit = getLimitForType(req, requestedType, 'messages', DEFAULT_MESSAGE_LIMIT, 'messageLimit');

        if (!keyword) {
            return res.status(200).json({
                query: '',
                type: requestedType,
                users: emptyPage(userLimit),
                conversations: emptyPage(conversationLimit),
                messages: emptyPage(messageLimit),
            });
        }

        if (keyword.length > MAX_SEARCH_QUERY_LENGTH) {
            return res.status(400).json({
                message: `Search query must not exceed ${MAX_SEARCH_QUERY_LENGTH} characters.`,
            });
        }

        const keywordRegex = new RegExp(escapeRegex(keyword), 'i');
        const normalizedKeyword = normalizeVietnamese(keyword);

        const friends = await Friend.find({
            $or: [
                { userA: currentUserId },
                { userB: currentUserId },
            ],
        })
            .select('userA userB nicknameA nicknameB')
            .lean();
        const nickMap = buildNicknameMap(friends, currentUserId.toString());
        const searchAll = requestedType === 'all';

        let users = emptyPage(userLimit);
        let conversations = emptyPage(conversationLimit);
        let messages = emptyPage(messageLimit);
        const tasks = [];

        if (searchAll || requestedType === 'users') {
            tasks.push((async () => {
                const blockedIds = await getBlockedIds(currentUserId);
                users = await searchUsersForGlobal({
                    keyword,
                    keywordRegex,
                    currentUserId,
                    blockedIds,
                    friends,
                    limit: userLimit,
                    cursor: searchAll ? null : getCursorForType(req, 'users'),
                });
            })());
        }

        if (searchAll || requestedType === 'conversations') {
            tasks.push((async () => {
                conversations = await searchConversationsForGlobal({
                    keywordRegex,
                    currentUserId,
                    limit: conversationLimit,
                    nickMap,
                    cursor: searchAll ? null : getCursorForType(req, 'conversations'),
                });
            })());
        }

        if (searchAll || requestedType === 'messages') {
            tasks.push((async () => {
                messages = await searchMessagesForGlobal({
                    currentUserId,
                    normalizedKeyword,
                    limit: messageLimit,
                    nickMap,
                    cursor: searchAll ? null : getCursorForType(req, 'messages'),
                });
            })());
        }

        await Promise.all(tasks);

        return res.status(200).json({
            query: keyword,
            type: requestedType,
            users,
            conversations,
            messages,
        });
    } catch (error) {
        console.error('Global search error:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}
