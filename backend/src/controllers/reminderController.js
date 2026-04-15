import crypto from 'crypto';
import mongoose from 'mongoose';
import Reminder from '../models/reminderModel.js';
import Conversation from '../models/conversationModel.js';
import Message from '../models/messageModel.js';
import User from '../models/userModel.js';
import { emitToUser, io } from '../socket/index.js';
import { emitNewMessage, updateConversationLastMessage } from '../utils/messageHelper.js';
import {
    REMINDER_REPEAT_RULES,
    REMINDER_STATUSES,
    REMINDER_UPCOMING_STATUSES,
    REMINDER_SCOPES,
    REMINDER_PARTICIPATION_STATUSES,
    REMINDER_SOURCE_TYPES,
    REMINDER_SOURCE_ACCEPTED_TYPES,
    REMINDER_NOTIFY_CHANNELS,
    ALLOWED_SNOOZE_MINUTES,
    ALLOWED_UPDATE_FIELDS,
    isValidDateInput,
    normalizeDate,
    normalizeReminderSource,
    resolveReminderContent,
    toArray,
    normalizeReminderOutput,
    validateSourcePayload,
} from '../utils/reminderHelper.js';

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const toObjectIdString = (value) => {
    if (!value) return '';
    return typeof value === 'string' ? value : value.toString();
};
const buildHttpError = (statusCode, message) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

const MAX_SNOOZE_COUNT = 20;
const EDITABLE_REMINDER_STATUSES = ['pending', 'snoozed'];
const REMIND_AT_MIN_LEAD_TIME_MS = 10 * 1000;

const REMINDER_SORT_OPTIONS = {
    remindat_asc: { field: 'remindAt', direction: 1 },
    remindat_desc: { field: 'remindAt', direction: -1 },
    createdat_desc: { field: 'createdAt', direction: -1 },
};

const emitSharedReminderEventToParticipants = async (sharedKey, eventName) => {
    const normalizedSharedKey = String(sharedKey || '').trim();
    if (!normalizedSharedKey) {
        return [];
    }

    const sharedReminders = await Reminder.find({
        sharedKey: normalizedSharedKey,
        scope: 'shared',
    });

    for (const sharedReminder of sharedReminders) {
        const targetUserId = toObjectIdString(sharedReminder.userId);
        if (!targetUserId) continue;

        emitToUser(targetUserId, eventName, {
            reminder: normalizeReminderOutput(sharedReminder),
        });
    }

    return sharedReminders;
};

const encodeReminderCursor = (reminder, sortField) => {
    if (!reminder?._id || !reminder?.[sortField]) return null;

    const payload = {
        id: toObjectIdString(reminder._id),
        value: new Date(reminder[sortField]).toISOString(),
    };

    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
};

const decodeReminderCursor = (cursor) => {
    const raw = String(cursor || '').trim();
    if (!raw) return null;

    // Backward compatibility for old _id-only cursor.
    if (mongoose.Types.ObjectId.isValid(raw)) {
        return { legacyId: raw };
    }

    try {
        const decoded = Buffer.from(raw, 'base64url').toString('utf8');
        const parsed = JSON.parse(decoded);

        const id = String(parsed?.id || '').trim();
        const valueRaw = parsed?.value;

        if (!mongoose.Types.ObjectId.isValid(id) || !isValidDateInput(valueRaw)) {
            return null;
        }

        const valueDate = normalizeDate(valueRaw);
        if (Number.isNaN(valueDate.getTime())) {
            return null;
        }

        return {
            id,
            value: valueDate,
        };
    } catch (error) {
        return null;
    }
};


export async function createReminder(req, res) {
    try {
        const userId = req.user._id;
        const { content, title, note, remindAt, repeatRule, source, notifyChannels } = req.body;
        const normalizedContent = resolveReminderContent({ content, title, note });

        if (!normalizedContent) {
            return res.status(400).json({ message: 'Content is required.' });
        }

        if (!remindAt || !isValidDateInput(remindAt)) {
            return res.status(400).json({ message: 'remindAt must be a valid date.' });
        }

        const remindAtDate = normalizeDate(remindAt);
        if (remindAtDate.getTime() <= Date.now() + REMIND_AT_MIN_LEAD_TIME_MS) {
            return res.status(400).json({ message: 'remindAt must be at least 10 seconds in the future.' });
        }

        if (repeatRule && !REMINDER_REPEAT_RULES.includes(repeatRule)) {
            return res.status(400).json({ message: 'Invalid repeatRule value.' });
        }

        let normalizedNotifyChannels;
        if (notifyChannels !== undefined) {
            const channelList = toArray(notifyChannels) || [];
            if (channelList.length === 0) {
                return res.status(400).json({ message: 'Cần chọn ít nhất một kênh thông báo.' });
            }
            const hasInvalidChannel = channelList.some((channel) => !REMINDER_NOTIFY_CHANNELS.includes(channel));
            if (hasInvalidChannel) {
                return res.status(400).json({ message: 'Invalid notifyChannels value.' });
            }
            normalizedNotifyChannels = channelList;
        }

        const { normalizedSource, error: sourceError } = validateSourcePayload(source);
        if (sourceError) {
            return res.status(400).json({ message: sourceError });
        }

        const payload = {
            userId,
            content: normalizedContent,
            remindAt: remindAtDate,
        };

        if (repeatRule) {
            payload.repeatRule = repeatRule;
        }
        if (normalizedSource) {
            payload.source = normalizedSource;
        }
        if (normalizedNotifyChannels) {
            payload.notifyChannels = normalizedNotifyChannels;
        }

        const reminder = await Reminder.create(payload);
        const normalizedReminder = normalizeReminderOutput(reminder);

        emitToUser(userId.toString(), 'reminder-created', {
            reminder: normalizedReminder,
        });

        return res.status(201).json({ reminder: normalizedReminder });
    } catch (error) {
        console.error('Create reminder error:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

export async function createSharedReminderFromMessage(req, res) {
    try {
        const userId = req.user._id;
        const userIdStr = toObjectIdString(userId);
        const {
            conversationId,
            messageId,
            content,
            remindAt,
            repeatRule,
            notifyChannels,
        } = req.body;

        if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
            return res.status(400).json({ message: 'conversationId không hợp lệ.' });
        }

        if (!messageId || !mongoose.Types.ObjectId.isValid(messageId)) {
            return res.status(400).json({ message: 'messageId không hợp lệ.' });
        }

        const normalizedContent = resolveReminderContent({ content });
        if (!normalizedContent) {
            return res.status(400).json({ message: 'Content is required.' });
        }

        if (!remindAt || !isValidDateInput(remindAt)) {
            return res.status(400).json({ message: 'remindAt must be a valid date.' });
        }

        const remindAtDate = normalizeDate(remindAt);
        if (remindAtDate.getTime() <= Date.now() + REMIND_AT_MIN_LEAD_TIME_MS) {
            return res.status(400).json({ message: 'remindAt must be at least 10 seconds in the future.' });
        }

        if (repeatRule && !REMINDER_REPEAT_RULES.includes(repeatRule)) {
            return res.status(400).json({ message: 'Invalid repeatRule value.' });
        }

        let normalizedNotifyChannels;
        if (notifyChannels !== undefined) {
            const channelList = toArray(notifyChannels);
            if (!channelList || channelList.length === 0) {
                return res.status(400).json({ message: 'Cần chọn ít nhất một kênh thông báo.' });
            }
            const hasInvalidChannel = channelList.some((channel) => !REMINDER_NOTIFY_CHANNELS.includes(channel));
            if (hasInvalidChannel) {
                return res.status(400).json({ message: 'Invalid notifyChannels value.' });
            }
            normalizedNotifyChannels = channelList;
        }

        const runSharedCreation = async (session = null) => {
            const conversationQuery = Conversation.findById(conversationId);
            if (session) conversationQuery.session(session);

            const conversation = await conversationQuery;
            if (!conversation) {
                throw buildHttpError(404, 'Conversation not found.');
            }

            if (conversation.type === 'group' && conversation.disbanded === true) {
                throw buildHttpError(403, 'Nhóm đã giải tán, không thể tạo nhắc hẹn chung.');
            }

            // Snapshot membership at creation time: only these users receive this shared reminder.
            const participantIds = Array.from(new Set(
                conversation.participants
                    .map((participant) => toObjectIdString(participant.userId?._id || participant.userId))
                    .filter(Boolean)
            ));

            if (!participantIds.includes(userIdStr)) {
                throw buildHttpError(403, 'Bạn không thuộc cuộc trò chuyện này.');
            }

            const messageQuery = Message.findById(messageId).select('_id conversationId');
            if (session) messageQuery.session(session);

            const messageDoc = await messageQuery;
            if (!messageDoc || toObjectIdString(messageDoc.conversationId) !== toObjectIdString(conversation._id)) {
                throw buildHttpError(400, 'Tin nhắn nguồn không thuộc cuộc trò chuyện.');
            }

            const sharedKey = crypto.randomBytes(24).toString('hex');
            const payload = participantIds.map((participantId) => ({
                userId: participantId,
                scope: 'shared',
                sharedKey,
                conversationId: conversation._id,
                createdBy: userId,
                participationStatus: 'joined',
                content: normalizedContent,
                remindAt: remindAtDate,
                repeatRule: repeatRule || 'none',
                source: { type: 'message', refId: toObjectIdString(messageDoc._id) },
                notifyChannels: normalizedNotifyChannels || ['inapp'],
            }));

            const insertOptions = { ordered: true };
            if (session) insertOptions.session = session;
            const createdReminders = await Reminder.insertMany(payload, insertOptions);
            const creatorReminder = createdReminders.find((item) => toObjectIdString(item.userId) === userIdStr);

            const messageMetadata = {
                sharedKey,
                creatorId: userIdStr,
                creatorName: req.user.displayName || 'Một thành viên',
                participantCount: participantIds.length,
                participantUserIds: participantIds,
                reminderContent: normalizedContent,
                remindAt: remindAtDate.toISOString(),
                sourceType: 'message',
            };

            const systemMessageData = {
                conversationId: conversation._id,
                senderId: userId,
                senderInfo: {
                    displayName: req.user.displayName,
                    avatarUrl: req.user.avatarUrl,
                },
                type: 'system',
                systemType: 'shared_reminder_created',
                content: 'Đã tạo nhắc hẹn chung',
                metadata: messageMetadata,
            };

            let systemMessage;
            if (session) {
                const docs = await Message.create([systemMessageData], { session });
                systemMessage = docs[0];
            } else {
                systemMessage = await Message.create(systemMessageData);
            }

            updateConversationLastMessage(conversation, systemMessage, userId);
            if (session) {
                await conversation.save({ session });
            } else {
                await conversation.save();
            }

            return {
                conversation,
                systemMessage,
                createdReminders,
                creatorReminder,
                sharedKey,
                participantIds,
            };
        };

        let creationResult;
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                creationResult = await runSharedCreation(session);
            });
        } catch (error) {
            const message = String(error?.message || '');
            const transactionUnsupported = message.includes('Transaction numbers are only allowed')
                || message.includes('replica set')
                || message.includes('transaction not supported');

            if (!transactionUnsupported) {
                throw error;
            }

            console.warn('Shared reminder transaction unsupported, fallback to non-transactional flow.');
            creationResult = await runSharedCreation(null);
        } finally {
            await session.endSession();
        }

        emitNewMessage(io, creationResult.conversation, creationResult.systemMessage);

        for (const reminder of creationResult.createdReminders) {
            const targetUserId = toObjectIdString(reminder.userId);
            if (!targetUserId || targetUserId === userIdStr) continue;
            emitToUser(targetUserId, 'reminder-created', {
                reminder: normalizeReminderOutput(reminder),
            });
        }

        return res.status(201).json({
            reminder: normalizeReminderOutput(creationResult.creatorReminder),
            sharedKey: creationResult.sharedKey,
            participantCount: creationResult.participantIds.length,
            messageId: creationResult.systemMessage._id,
        });
    } catch (error) {
        if (error?.statusCode) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        console.error('Create shared reminder from message error:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

export async function getReminders(req, res) {
    try {
        const userId = req.user._id;
        const { status, sourceType, from, to, sharedKey, sort = 'remindAt_asc', cursor, limit = 50 } = req.query;

        const query = { userId };

        if (status) {
            const statusList = String(status)
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean);

            const hasInvalidStatus = statusList.some((item) => !REMINDER_STATUSES.includes(item));
            if (hasInvalidStatus) {
                return res.status(400).json({ message: 'Invalid status filter.' });
            }
            query.status = { $in: statusList };
        } else {
            query.status = { $in: ['pending', 'snoozed'] };
        }

        if (sourceType) {
            const normalizedSourceType = normalizeReminderSource({ type: sourceType })?.type;

            if (!normalizedSourceType || !REMINDER_SOURCE_ACCEPTED_TYPES.includes(String(sourceType).trim())) {
                return res.status(400).json({ message: 'Invalid sourceType filter.' });
            }

            if (normalizedSourceType === 'meeting') {
                query['source.type'] = { $in: ['meeting', 'call'] };
            } else {
                query['source.type'] = normalizedSourceType;
            }
        }

        if (from || to) {
            query.remindAt = {};

            if (from) {
                if (!isValidDateInput(from)) {
                    return res.status(400).json({ message: 'Invalid from date.' });
                }
                query.remindAt.$gte = normalizeDate(from);
            }

            if (to) {
                if (!isValidDateInput(to)) {
                    return res.status(400).json({ message: 'Invalid to date.' });
                }
                const toDate = normalizeDate(to);
                toDate.setHours(23, 59, 59, 999);
                query.remindAt.$lte = toDate;
            }
        }

        if (sharedKey) {
            query.sharedKey = String(sharedKey).trim();
        }

        const pageSize = Math.min(Math.max(Number(limit) || 50, 1), 100);

        const sortBy = String(sort || 'remindAt_asc').trim().toLowerCase();
        const sortConfig = REMINDER_SORT_OPTIONS[sortBy] || REMINDER_SORT_OPTIONS.remindat_asc;
        const { field: sortField, direction: sortDirection } = sortConfig;
        const compareOperator = sortDirection === 1 ? '$gt' : '$lt';

        if (cursor) {
            const decodedCursor = decodeReminderCursor(cursor);
            if (!decodedCursor) {
                return res.status(400).json({ message: 'Invalid cursor.' });
            }

            if (decodedCursor.legacyId) {
                query._id = { [compareOperator]: new mongoose.Types.ObjectId(decodedCursor.legacyId) };
            } else {
                query.$or = [
                    { [sortField]: { [compareOperator]: decodedCursor.value } },
                    {
                        [sortField]: decodedCursor.value,
                        _id: { [compareOperator]: new mongoose.Types.ObjectId(decodedCursor.id) },
                    },
                ];
            }
        }

        const sortOption = {
            [sortField]: sortDirection,
            _id: sortDirection,
        };

        const reminders = await Reminder.find(query)
            .sort(sortOption)
            .limit(pageSize + 1)
            .lean();

        const hasMore = reminders.length > pageSize;
        const data = hasMore ? reminders.slice(0, pageSize) : reminders;
        const nextCursor = hasMore ? encodeReminderCursor(data[data.length - 1], sortField) : null;

        return res.status(200).json({
            reminders: data.map((item) => normalizeReminderOutput(item)),
            hasMore,
            nextCursor,
        });
    } catch (error) {
        console.error('Get reminders error:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

export async function getSharedReminderOverview(req, res) {
    try {
        const userId = req.user._id;
        const userIdStr = toObjectIdString(userId);
        const sharedKey = String(req.params.sharedKey || '').trim();

        if (!sharedKey) {
            return res.status(400).json({ message: 'sharedKey is required.' });
        }

        const sharedReminders = await Reminder.find({
            sharedKey,
            scope: 'shared',
        }).lean();

        if (sharedReminders.length === 0) {
            return res.status(404).json({ message: 'Shared reminder not found.' });
        }

        const fallbackSample = sharedReminders[0];

        const participantIds = Array.from(new Set(
            sharedReminders
                .map((item) => toObjectIdString(item.userId))
                .filter(Boolean)
        ));

        if (!participantIds.includes(userIdStr)) {
            return res.status(404).json({ message: 'Shared reminder not found.' });
        }

        const users = await User.find({ _id: { $in: participantIds } })
            .select('displayName avatarUrl')
            .lean();
        const userById = new Map(users.map((user) => [toObjectIdString(user._id), user]));

        const reminderByUserId = new Map(sharedReminders.map((item) => [toObjectIdString(item.userId), item]));
        const creatorId = toObjectIdString(fallbackSample.createdBy);
        const creatorReminder = creatorId ? reminderByUserId.get(creatorId) : null;
        const sample = creatorReminder
            || [...sharedReminders].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]
            || fallbackSample;
        const conversationId = sample.conversationId;

        const participantRows = participantIds
            .map((participantId) => {
                const reminder = reminderByUserId.get(participantId);
                if (!reminder) return null;

                const userInfo = userById.get(participantId);
                const participationStatus = reminder.participationStatus === 'declined'
                    ? 'declined'
                    : 'joined';

                return {
                    userId: participantId,
                    displayName: userInfo?.displayName || 'Thành viên',
                    avatarUrl: userInfo?.avatarUrl || null,
                    participationStatus,
                    hasReminder: true,
                    reminderId: reminder._id,
                    isCreator: participantId === creatorId,
                    isCurrentUser: participantId === userIdStr,
                };
            })
            .filter(Boolean)
            .sort((a, b) => {
                if (a.isCreator && !b.isCreator) return -1;
                if (!a.isCreator && b.isCreator) return 1;
                return a.displayName.localeCompare(b.displayName, 'vi');
            });

        const joinedCount = participantRows.filter((item) => item.participationStatus === 'joined').length;
        const declinedCount = participantRows.length - joinedCount;

        return res.status(200).json({
            sharedKey,
            conversationId: toObjectIdString(conversationId),
            content: resolveReminderContent(sample),
            remindAt: sample.remindAt,
            repeatRule: sample.repeatRule,
            source: normalizeReminderSource(sample.source),
            createdBy: creatorId,
            participantCount: participantRows.length,
            joinedCount,
            declinedCount,
            participants: participantRows,
        });
    } catch (error) {
        console.error('Get shared reminder overview error:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

export async function getReminderSummary(req, res) {
    try {
        const userId = req.user._id;

        const upcomingCount = await Reminder.countDocuments({
            userId,
            status: { $in: REMINDER_UPCOMING_STATUSES },
        });

        return res.status(200).json({ upcomingCount });
    } catch (error) {
        console.error('Get reminder summary error:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

export async function getReminderById(req, res) {
    try {
        const userId = req.user._id;
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid reminder id.' });
        }

        const reminder = await Reminder.findOne({ _id: id, userId }).lean();
        if (!reminder) {
            return res.status(404).json({ message: 'Reminder not found.' });
        }

        return res.status(200).json({ reminder: normalizeReminderOutput(reminder) });
    } catch (error) {
        console.error('Get reminder by id error:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

export async function updateReminder(req, res) {
    try {
        const userId = req.user._id;
        const userIdStr = toObjectIdString(userId);
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid reminder id.' });
        }

        const reminder = await Reminder.findOne({ _id: id, userId });
        if (!reminder) {
            return res.status(404).json({ message: 'Reminder not found.' });
        }

        const isSharedReminder = reminder.scope === 'shared';
        const isSharedCreator = isSharedReminder && toObjectIdString(reminder.createdBy) === userIdStr;

        if (!EDITABLE_REMINDER_STATUSES.includes(reminder.status)) {
            return res.status(400).json({ message: 'Chỉ có thể chỉnh sửa nhắc hẹn đang chờ hoặc đang tạm hoãn.' });
        }

        const updates = {};
        for (const field of ALLOWED_UPDATE_FIELDS) {
            if (hasOwn(req.body, field)) {
                updates[field] = req.body[field];
            }
        }

        if (hasOwn(req.body, 'content') || hasOwn(req.body, 'title') || hasOwn(req.body, 'note')) {
            updates.content = resolveReminderContent({
                content: req.body.content,
                title: req.body.title,
                note: req.body.note,
            });
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ message: 'No valid fields to update.' });
        }

        if (isSharedReminder && !isSharedCreator) {
            const disallowedFields = Object.keys(updates).filter((field) => field !== 'notifyChannels');
            if (disallowedFields.length > 0) {
                return res.status(403).json({ message: 'Bạn chỉ có thể chỉnh kênh thông báo cá nhân của nhắc hẹn chung.' });
            }
        }

        if (updates.content !== undefined) {
            const normalizedContent = String(updates.content || '').trim();
            if (!normalizedContent) {
                return res.status(400).json({ message: 'Content cannot be empty.' });
            }
            updates.content = normalizedContent;
        }

        if (updates.repeatRule !== undefined && !REMINDER_REPEAT_RULES.includes(updates.repeatRule)) {
            return res.status(400).json({ message: 'Invalid repeatRule value.' });
        }

        if (updates.notifyChannels !== undefined) {
            const channelList = toArray(updates.notifyChannels) || [];
            if (channelList.length === 0) {
                return res.status(400).json({ message: 'Cần chọn ít nhất một kênh thông báo.' });
            }
            const hasInvalidChannel = channelList.some((channel) => !REMINDER_NOTIFY_CHANNELS.includes(channel));
            if (hasInvalidChannel) {
                return res.status(400).json({ message: 'Invalid notifyChannels value.' });
            }
            updates.notifyChannels = channelList;
        }

        if (updates.remindAt !== undefined) {
            if (!isValidDateInput(updates.remindAt)) {
                return res.status(400).json({ message: 'remindAt must be a valid date.' });
            }

            const remindAtDate = normalizeDate(updates.remindAt);
            if (remindAtDate.getTime() <= Date.now() + REMIND_AT_MIN_LEAD_TIME_MS) {
                return res.status(400).json({ message: 'remindAt must be at least 10 seconds in the future.' });
            }

            updates.remindAt = remindAtDate;
        }

        if (isSharedReminder && reminder.sharedKey) {
            const sharedQuery = {
                sharedKey: reminder.sharedKey,
                scope: 'shared',
            };

            // Creator can edit shared timeline/content, but notify channel is always per-user preference.
            const participantOnlyUpdates = {};
            if (updates.notifyChannels !== undefined) {
                participantOnlyUpdates.notifyChannels = updates.notifyChannels;
            }

            const sharedUpdates = { ...updates };
            delete sharedUpdates.notifyChannels;
            const hasSharedTimelineChange = Object.keys(sharedUpdates).length > 0;

            if (sharedUpdates.remindAt !== undefined) {
                const { remindAt, ...sharedFields } = sharedUpdates;

                if (Object.keys(sharedFields).length > 0) {
                    await Reminder.updateMany(sharedQuery, {
                        $set: sharedFields,
                    });
                }

                await Reminder.updateMany(
                    {
                        ...sharedQuery,
                        participationStatus: { $ne: 'declined' },
                    },
                    {
                        $set: {
                            remindAt,
                            status: 'pending',
                            snoozeCount: 0,
                        },
                        $unset: { snoozeUntil: 1 },
                    }
                );

                await Reminder.updateMany(
                    {
                        ...sharedQuery,
                        participationStatus: 'declined',
                    },
                    {
                        $set: {
                            remindAt,
                            status: 'dismissed',
                            snoozeCount: 0,
                        },
                        $unset: { snoozeUntil: 1 },
                    }
                );
            } else if (Object.keys(sharedUpdates).length > 0) {
                await Reminder.updateMany(sharedQuery, {
                    $set: sharedUpdates,
                });
            }

            if (Object.keys(participantOnlyUpdates).length > 0) {
                await Reminder.updateOne(
                    {
                        ...sharedQuery,
                        userId,
                    },
                    {
                        $set: participantOnlyUpdates,
                    }
                );
            }

            const refreshedSharedReminders = await Reminder.find(sharedQuery);
            for (const sharedReminder of refreshedSharedReminders) {
                const targetUserId = toObjectIdString(sharedReminder.userId);
                if (!targetUserId) continue;
                emitToUser(targetUserId, 'reminder-updated', {
                    reminder: normalizeReminderOutput(sharedReminder),
                });
            }

            const updatedSelf = refreshedSharedReminders.find(
                (item) => toObjectIdString(item.userId) === userIdStr
            ) || reminder;

            if (hasSharedTimelineChange && reminder.conversationId) {
                const conversation = await Conversation.findById(reminder.conversationId);

                if (conversation) {
                    const actorName = req.user.displayName || 'Một thành viên';
                    const normalizedUpdatedSelf = normalizeReminderOutput(updatedSelf);
                    const systemMessage = await Message.create({
                        conversationId: conversation._id,
                        senderId: userId,
                        senderInfo: {
                            displayName: req.user.displayName,
                            avatarUrl: req.user.avatarUrl,
                        },
                        type: 'system',
                        systemType: 'shared_reminder_updated',
                        content: `${actorName} đã chỉnh sửa nhắc hẹn chung.`,
                        metadata: {
                            sharedKey: reminder.sharedKey,
                            actorId: userIdStr,
                            actorName,
                            changedFields: Object.keys(sharedUpdates),
                            reminderContent: resolveReminderContent(updatedSelf),
                            remindAt: normalizedUpdatedSelf?.remindAt || reminder.remindAt?.toISOString?.(),
                        },
                    });

                    updateConversationLastMessage(conversation, systemMessage, userId);
                    await conversation.save();
                    emitNewMessage(io, conversation, systemMessage);
                }
            }

            return res.status(200).json({ reminder: normalizeReminderOutput(updatedSelf) });
        }

        Object.assign(reminder, updates);

        if (updates.remindAt !== undefined) {
            reminder.status = 'pending';
            reminder.snoozeUntil = undefined;
            reminder.snoozeCount = 0;
        }

        await reminder.save();

        const normalizedReminder = normalizeReminderOutput(reminder);
        emitToUser(userIdStr, 'reminder-updated', { reminder: normalizedReminder });

        return res.status(200).json({ reminder: normalizedReminder });
    } catch (error) {
        console.error('Update reminder error:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

export async function snoozeReminder(req, res) {
    try {
        const userId = req.user._id;
        const { id } = req.params;
        const minutes = Number(req.body?.minutes);

        if (!ALLOWED_SNOOZE_MINUTES.includes(minutes)) {
            return res.status(400).json({ message: 'minutes must be one of: 5, 10, 30, 60.' });
        }

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid reminder id.' });
        }

        const reminder = await Reminder.findOne({ _id: id, userId });
        if (!reminder) {
            return res.status(404).json({ message: 'Reminder not found.' });
        }

        if (reminder.scope === 'shared' && reminder.participationStatus === 'declined') {
            return res.status(400).json({ message: 'Bạn đã không tham gia nhắc hẹn này.' });
        }

        if ((reminder.snoozeCount || 0) >= MAX_SNOOZE_COUNT) {
            return res.status(429).json({ message: `Bạn đã đạt giới hạn snooze (${MAX_SNOOZE_COUNT} lần) cho nhắc hẹn này.` });
        }

        const nextRemindAt = new Date(Date.now() + minutes * 60000);
        reminder.snoozeUntil = nextRemindAt;
        reminder.status = 'snoozed';
        reminder.snoozeCount = (reminder.snoozeCount || 0) + 1;
        await reminder.save();

        const outputReminder = normalizeReminderOutput(reminder);

        emitToUser(userId.toString(), 'reminder-snoozed', { reminder: outputReminder });

        return res.status(200).json({ reminder: outputReminder });
    } catch (error) {
        console.error('Snooze reminder error:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

export async function dismissReminder(req, res) {
    try {
        const userId = req.user._id;
        const userIdStr = toObjectIdString(userId);
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid reminder id.' });
        }

        const reminder = await Reminder.findOne({ _id: id, userId });
        if (!reminder) {
            return res.status(404).json({ message: 'Reminder not found.' });
        }

        if (reminder.status === 'dismissed') {
            return res.status(200).json({ reminder: normalizeReminderOutput(reminder) });
        }

        reminder.status = 'dismissed';
        reminder.snoozeUntil = undefined;
        await reminder.save();

        const normalizedReminder = normalizeReminderOutput(reminder);
        emitToUser(userIdStr, 'reminder-updated', { reminder: normalizedReminder });

        return res.status(200).json({ reminder: normalizedReminder });
    } catch (error) {
        console.error('Dismiss reminder error:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

export async function updateSharedReminderParticipation(req, res) {
    try {
        const userId = req.user._id;
        const userIdStr = toObjectIdString(userId);
        const sharedKey = String(req.params.sharedKey || '').trim();
        const participate = Boolean(req.body?.participate);

        if (!sharedKey) {
            return res.status(400).json({ message: 'sharedKey is required.' });
        }

        const reminder = await Reminder.findOne({
            userId,
            sharedKey,
            scope: 'shared',
        });

        if (!reminder) {
            return res.status(404).json({ message: 'Shared reminder not found.' });
        }

        if (reminder.scope !== 'shared') {
            return res.status(400).json({ message: 'Invalid reminder scope.' });
        }

        const nowTs = Date.now();
        const desiredParticipation = participate ? 'joined' : 'declined';
        const desiredStatus = participate
            ? (reminder.remindAt.getTime() > nowTs ? 'pending' : 'triggered')
            : 'dismissed';
        const alreadySynced = reminder.participationStatus === desiredParticipation
            && reminder.status === desiredStatus
            && !reminder.snoozeUntil;

        if (alreadySynced) {
            return res.status(200).json({ reminder: normalizeReminderOutput(reminder) });
        }

        const previousParticipation = reminder.participationStatus;

        if (participate) {
            reminder.participationStatus = 'joined';
            reminder.snoozeUntil = undefined;
            reminder.status = desiredStatus;
        } else {
            reminder.participationStatus = 'declined';
            reminder.status = 'dismissed';
            reminder.snoozeUntil = undefined;
        }

        await reminder.save();

        const refreshedSharedReminders = await emitSharedReminderEventToParticipants(sharedKey, 'reminder-participation-updated');
        const selfReminder = refreshedSharedReminders.find(
            (item) => toObjectIdString(item.userId) === userIdStr
        ) || reminder;
        const normalized = normalizeReminderOutput(selfReminder);

        if (previousParticipation !== reminder.participationStatus && reminder.conversationId) {
            const conversation = await Conversation.findById(reminder.conversationId);

            if (conversation) {
                const action = participate ? 'joined' : 'declined';
                const actorName = req.user.displayName || 'Một thành viên';
                const systemMessage = await Message.create({
                    conversationId: conversation._id,
                    senderId: userId,
                    senderInfo: {
                        displayName: req.user.displayName,
                        avatarUrl: req.user.avatarUrl,
                    },
                    type: 'system',
                    systemType: 'shared_reminder_participation_changed',
                    content: participate
                        ? `${actorName} đã tham gia nhắc hẹn.`
                        : `${actorName} đã từ chối tham gia nhắc hẹn.`,
                    metadata: {
                        sharedKey,
                        actorId: userIdStr,
                        actorName,
                        action,
                        reminderContent: resolveReminderContent(reminder),
                        remindAt: reminder.remindAt.toISOString(),
                    },
                });

                updateConversationLastMessage(conversation, systemMessage, userId);
                await conversation.save();
                emitNewMessage(io, conversation, systemMessage);
            }
        }

        return res.status(200).json({ reminder: normalized });
    } catch (error) {
        console.error('Update shared reminder participation error:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

const BULK_DELETE_SCOPES = {
    upcoming: ['pending', 'snoozed'],
    past: ['triggered', 'dismissed'],
};

export async function deleteRemindersByScope(req, res) {
    try {
        const userId = req.user._id;
        const userIdStr = toObjectIdString(userId);
        const scope = String(req.query.scope || '').trim().toLowerCase();

        if (String(req.query.includeShared || '').trim().toLowerCase() === 'true') {
            return res.status(400).json({ message: 'Bulk delete does not support shared reminders.' });
        }

        if (!['upcoming', 'past', 'all'].includes(scope)) {
            return res.status(400).json({ message: 'scope must be one of: upcoming, past, all.' });
        }

        const query = {
            userId,
            scope: 'personal',
        };
        if (scope !== 'all') {
            query.status = { $in: BULK_DELETE_SCOPES[scope] };
        }

        const result = await Reminder.deleteMany(query);
        const deletedCount = result.deletedCount || 0;

        emitToUser(userIdStr, 'reminders-bulk-deleted', {
            scope,
            deletedCount,
        });

        return res.status(200).json({
            deletedCount,
            scope,
            warning: 'Shared reminders are not affected by bulk delete.',
        });
    } catch (error) {
        console.error('Bulk delete reminders error:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}

export async function deleteReminder(req, res) {
    try {
        const userId = req.user._id;
        const userIdStr = toObjectIdString(userId);
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid reminder id.' });
        }

        const reminder = await Reminder.findOne({ _id: id, userId });
        if (!reminder) {
            return res.status(404).json({ message: 'Reminder not found.' });
        }

        if (reminder.scope === 'shared' && reminder.sharedKey) {
            const isCreator = toObjectIdString(reminder.createdBy) === userIdStr;

            // Shared delete semantics:
            // - Creator: cancel for all participants in sharedKey.
            // - Member: opt-out only (equivalent to "khong tham gia").

            if (isCreator) {
                const sharedParticipantReminders = await Reminder.find({
                    sharedKey: reminder.sharedKey,
                    scope: 'shared',
                })
                    .select('userId')
                    .lean();

                const participantUserIds = Array.from(new Set(
                    sharedParticipantReminders
                        .map((item) => toObjectIdString(item.userId))
                        .filter(Boolean)
                ));

                if (!participantUserIds.includes(userIdStr)) {
                    participantUserIds.push(userIdStr);
                }

                const result = await Reminder.deleteMany({
                    sharedKey: reminder.sharedKey,
                    scope: 'shared',
                });

                for (const participantUserId of participantUserIds) {
                    emitToUser(participantUserId, 'shared-reminder-cancelled', {
                        sharedKey: reminder.sharedKey,
                        actorId: userIdStr,
                    });
                }

                if (reminder.conversationId) {
                    const conversation = await Conversation.findById(reminder.conversationId);

                    if (conversation) {
                        const actorName = req.user.displayName || 'Một thành viên';
                        const systemMessage = await Message.create({
                            conversationId: conversation._id,
                            senderId: userId,
                            senderInfo: {
                                displayName: req.user.displayName,
                                avatarUrl: req.user.avatarUrl,
                            },
                            type: 'system',
                            systemType: 'shared_reminder_cancelled',
                            content: `${actorName} đã hủy nhắc hẹn chung.`,
                            metadata: {
                                sharedKey: reminder.sharedKey,
                                actorId: userIdStr,
                                actorName,
                                reminderContent: resolveReminderContent(reminder),
                                remindAt: reminder.remindAt?.toISOString?.(),
                            },
                        });

                        updateConversationLastMessage(conversation, systemMessage, userId);
                        await conversation.save();
                        emitNewMessage(io, conversation, systemMessage);
                    }
                }

                return res.status(200).json({
                    message: 'Đã hủy nhắc hẹn chung cho tất cả thành viên.',
                    deletedCount: result.deletedCount || 0,
                });
            }

            const previousParticipation = reminder.participationStatus;
            reminder.participationStatus = 'declined';
            reminder.status = 'dismissed';
            reminder.snoozeUntil = undefined;
            await reminder.save();

            const refreshedSharedReminders = await emitSharedReminderEventToParticipants(
                reminder.sharedKey,
                'reminder-participation-updated'
            );
            const selfReminder = refreshedSharedReminders.find(
                (item) => toObjectIdString(item.userId) === userIdStr
            ) || reminder;
            const normalized = normalizeReminderOutput(selfReminder);

            if (previousParticipation !== 'declined' && reminder.conversationId) {
                const conversation = await Conversation.findById(reminder.conversationId);

                if (conversation) {
                    const actorName = req.user.displayName || 'Một thành viên';
                    const systemMessage = await Message.create({
                        conversationId: conversation._id,
                        senderId: userId,
                        senderInfo: {
                            displayName: req.user.displayName,
                            avatarUrl: req.user.avatarUrl,
                        },
                        type: 'system',
                        systemType: 'shared_reminder_participation_changed',
                        content: `${actorName} đã từ chối tham gia nhắc hẹn.`,
                        metadata: {
                            sharedKey: reminder.sharedKey,
                            actorId: userIdStr,
                            actorName,
                            action: 'declined',
                            reminderContent: resolveReminderContent(reminder),
                            remindAt: reminder.remindAt.toISOString(),
                        },
                    });

                    updateConversationLastMessage(conversation, systemMessage, userId);
                    await conversation.save();
                    emitNewMessage(io, conversation, systemMessage);
                }
            }

            return res.status(200).json({
                message: 'Bạn đã không tham gia nhắc hẹn chung.',
                reminder: normalized,
            });
        }

        await Reminder.deleteOne({ _id: reminder._id });

        emitToUser(userIdStr, 'reminder-deleted', {
            id: toObjectIdString(reminder._id),
        });

        return res.status(200).json({ message: 'Reminder deleted.' });
    } catch (error) {
        console.error('Delete reminder error:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}
