import mongoose from 'mongoose';
import User from '../models/userModel.js';
import Message from '../models/messageModel.js';
import Conversation from '../models/conversationModel.js';
import Report, { REPORT_DECISIONS, REPORT_STATUSES, REPORT_TARGET_TYPES } from '../models/reportModel.js';
import AuditLog from '../models/auditLogModel.js';
import LockAppeal, { LOCK_APPEAL_STATUSES } from '../models/lockAppealModel.js';
import { createNotification } from '../services/notificationServices.js';
import { generateSignedUrl } from '../utils/messageHelper.js';
import {
    getViolationSummary,
    lockAccount,
    registerViolation,
    unlockAccount,
} from '../services/moderation/violationService.js';
import { io, isUserOnline } from '../socket/index.js';

const COMPLETED_REPORT_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const COMPLETED_APPEAL_TTL_MS = 180 * 24 * 60 * 60 * 1000;

function requireObjectId(value, name) {
    if (!mongoose.Types.ObjectId.isValid(value)) {
        const error = new Error(`${name} không hợp lệ.`);
        error.statusCode = 400;
        throw error;
    }
}

function parsePagination(query, defaultLimit = 20, maxLimit = 100) {
    const page = Math.max(1, Number.parseInt(query.page || '1', 10) || 1);
    const limit = Math.min(maxLimit, Math.max(1, Number.parseInt(query.limit || `${defaultLimit}`, 10) || defaultLimit));
    return { page, limit, skip: (page - 1) * limit };
}

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function userRoleFilter() {
    return { $or: [{ role: 'user' }, { role: { $exists: false } }, { role: null }] };
}

function toUserSummary(user, extras = {}) {
    return {
        _id: user._id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        phone: user.phone,
        role: user.role || 'user',
        lock: user.lock,
        moderation: user.moderation,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        ...extras,
    };
}

function messagePreview(message) {
    if (!message) return '';
    if (message.type === 'image') return '[Hình ảnh]';
    if (message.type === 'file') return message.fileName || '[File]';
    if (message.type === 'audio') return '[Tin nhắn thoại]';
    if (message.type === 'sticker') return '[Nhãn dán]';
    return message.content || '';
}

function violationEvidencePreview(message) {
    if (!message) return 'Không có nội dung xem trước.';
    if (message.type === 'image') {
        return message.content
            ? `Ảnh đính kèm kèm nội dung: "${message.content}"`
            : 'Ảnh đính kèm trong đoạn chat.';
    }
    if (message.type === 'file') {
        return `File đính kèm: ${message.fileName || 'không rõ tên file'}.`;
    }
    if (message.type === 'audio') {
        return message.content
            ? `Tin nhắn thoại được chuyển thành văn bản: "${message.content}"`
            : 'Tin nhắn thoại trong đoạn chat.';
    }
    if (message.type === 'link') {
        return `Liên kết đã gửi: ${message.content || 'không rõ liên kết'}.`;
    }
    if (message.type === 'sticker') {
        return 'Nhãn dán trong đoạn chat.';
    }
    return `"${String(message.content || '').slice(0, 500)}"`;
}

function serializeMessage(message) {
    const raw = message?.toObject ? message.toObject() : message;
    if (!raw) return null;

    return {
        _id: raw._id,
        conversationId: raw.conversationId,
        senderId: raw.senderId,
        type: raw.type,
        content: raw.content || '',
        fileName: raw.fileName || '',
        mimeType: raw.mimeType || '',
        fileSize: raw.fileSize || 0,
        signedUrl: raw.filePublicId ? generateSignedUrl(raw.filePublicId, raw.type) : null,
        preview: messagePreview(raw),
        reportStatus: Boolean(raw.reportStatus),
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
    };
}

function emptyAssetCounts() {
    return { image: 0, file: 0, link: 0, audio: 0, total: 0 };
}

function buildAssetCountMap(rows = []) {
    const map = new Map();

    rows.forEach((row) => {
        const senderId = row._id?.senderId?.toString?.();
        const type = row._id?.type;
        if (!senderId || !type) return;

        const current = map.get(senderId) || emptyAssetCounts();
        current[type] = row.count;
        current.total += row.count;
        map.set(senderId, current);
    });

    return map;
}

async function attachReportEvidence(reports) {
    const messageIds = reports
        .filter((report) => report.targetType === 'message' && report.targetMessageId)
        .map((report) => report.targetMessageId);

    if (messageIds.length === 0) {
        return reports.map((report) => ({ ...report, messageEvidence: null }));
    }

    const messages = await Message.find({ _id: { $in: messageIds } })
        .select('_id conversationId senderId type content fileName mimeType fileSize filePublicId reportStatus createdAt updatedAt')
        .lean();

    const messageMap = new Map(messages.map((message) => [message._id.toString(), serializeMessage(message)]));

    return reports.map((report) => ({
        ...report,
        messageEvidence: report.targetMessageId
            ? messageMap.get(report.targetMessageId.toString()) || null
            : null,
    }));
}

function handleAdminError(res, error, label) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) {
        console.error(label, error);
        return res.status(500).json({ message: 'Không thể xử lý yêu cầu admin.' });
    }

    return res.status(statusCode).json({ message: error.message || 'Yêu cầu không hợp lệ.' });
}

export async function getAdminStats(req, res) {
    try {
        const [totalUsers, lockedUsers, pendingMessageReports, pendingUserReports, pendingAppeals] = await Promise.all([
            User.countDocuments(userRoleFilter()),
            User.countDocuments({ ...userRoleFilter(), 'lock.isLocked': true }),
            Report.countDocuments({ targetType: 'message', status: { $in: ['pending', 'reviewing'] } }),
            Report.countDocuments({ targetType: 'user', status: { $in: ['pending', 'reviewing'] } }),
            LockAppeal.countDocuments({ status: 'pending' }),
        ]);

        return res.status(200).json({
            stats: {
                totalUsers,
                lockedUsers,
                pendingMessageReports,
                pendingUserReports,
                pendingAppeals,
            },
        });
    } catch (error) {
        return handleAdminError(res, error, 'Error fetching admin stats:');
    }
}

export async function listAdminUsers(req, res) {
    try {
        const { page, limit, skip } = parsePagination(req.query, 20, 50);
        const search = String(req.query.search || '').trim();
        const filter = userRoleFilter();

        if (search) {
            const regex = new RegExp(escapeRegex(search), 'i');
            filter.$and = [{
                $or: [
                    { email: regex },
                    { displayName: regex },
                    { phone: regex },
                ],
            }];
        }

        const [users, total] = await Promise.all([
            User.find(filter)
                .select('-password')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            User.countDocuments(filter),
        ]);

        const userIds = users.map((user) => user._id);
        const [reportCounts, assetCounts] = await Promise.all([
            Report.aggregate([
                { $match: { targetUserId: { $in: userIds }, status: { $in: ['pending', 'reviewing'] } } },
                { $group: { _id: '$targetUserId', count: { $sum: 1 } } },
            ]),
            Message.aggregate([
                { $match: { senderId: { $in: userIds }, type: { $in: ['image', 'file', 'link', 'audio'] } } },
                { $group: { _id: { senderId: '$senderId', type: '$type' }, count: { $sum: 1 } } },
            ]),
        ]);

        const reportCountMap = new Map(reportCounts.map((item) => [item._id.toString(), item.count]));
        const assetCountMap = buildAssetCountMap(assetCounts);
        const enrichedUsers = await Promise.all(users.map(async (user) => {
            const violationSummary = await getViolationSummary(user._id);
            return toUserSummary(user, {
                online: isUserOnline(user._id),
                violationSummary,
                openReportCount: reportCountMap.get(user._id.toString()) || 0,
                assetCounts: assetCountMap.get(user._id.toString()) || emptyAssetCounts(),
            });
        }));

        return res.status(200).json({
            users: enrichedUsers,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        return handleAdminError(res, error, 'Error listing admin users:');
    }
}

export async function getAdminUserProfile(req, res) {
    try {
        const { userId } = req.params;
        requireObjectId(userId, 'userId');

        const user = await User.findOne({ _id: userId, ...userRoleFilter() }).select('-password').lean();
        if (!user) {
            return res.status(404).json({ message: 'Không tìm thấy người dùng.' });
        }

        const now = new Date();
        const [violationSummary, reportCounts, groupCount, assetCounts, resolvedReportCount] = await Promise.all([
            getViolationSummary(user._id),
            Report.aggregate([
                { $match: { $or: [{ reporterId: user._id }, { targetUserId: user._id }] } },
                { $group: { _id: { targetType: '$targetType', status: '$status' }, count: { $sum: 1 } } },
            ]),
            Conversation.countDocuments({ type: 'group', 'participants.userId': user._id }),
            Message.aggregate([
                { $match: { senderId: user._id, type: { $in: ['image', 'file', 'link', 'audio'] } } },
                { $group: { _id: { senderId: '$senderId', type: '$type' }, count: { $sum: 1 } } },
            ]),
            Report.countDocuments({
                targetUserId: user._id,
                status: { $in: ['resolved', 'dismissed'] },
                expiresAt: { $gt: now },
            }),
        ]);

        const assetCountMap = buildAssetCountMap(assetCounts);

        return res.status(200).json({
            user: toUserSummary(user, {
                online: isUserOnline(user._id),
                violationSummary,
                assetCounts: assetCountMap.get(user._id.toString()) || emptyAssetCounts(),
                counters: {
                    reports: reportCounts,
                    groups: groupCount,
                    assets: assetCountMap.get(user._id.toString()) || emptyAssetCounts(),
                    resolvedReports: resolvedReportCount,
                },
            }),
        });
    } catch (error) {
        return handleAdminError(res, error, 'Error fetching admin user profile:');
    }
}

/*
 * Admins should not browse normal user messages from the overview. Older callers
 * of this endpoint only receive messages that have already been confirmed as
 * reported evidence.
 */
export async function getAdminUserMessages(req, res) {
    try {
        const { userId } = req.params;
        requireObjectId(userId, 'userId');
        const { limit, skip, page } = parsePagination(req.query, 30, 100);
        const filter = { senderId: userId, reportStatus: true };

        if (req.query.conversationId) {
            requireObjectId(req.query.conversationId, 'conversationId');
            filter.conversationId = req.query.conversationId;
        }

        const [messages, total] = await Promise.all([
            Message.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Message.countDocuments(filter),
        ]);

        return res.status(200).json({
            messages: messages.map(serializeMessage),
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        return handleAdminError(res, error, 'Error fetching reported user messages:');
    }
}

export async function getAdminUserResolvedReports(req, res) {
    try {
        const { userId } = req.params;
        requireObjectId(userId, 'userId');
        const { limit, skip, page } = parsePagination(req.query, 20, 100);
        const now = new Date();

        const filter = {
            targetUserId: userId,
            status: { $in: ['resolved', 'dismissed'] },
            expiresAt: { $gt: now },
        };

        const [reports, total] = await Promise.all([
            Report.find(filter)
                .sort({ 'review.reviewedAt': -1, updatedAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Report.countDocuments(filter),
        ]);

        const reportsWithEvidence = await attachReportEvidence(reports);

        return res.status(200).json({
            reports: reportsWithEvidence,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        return handleAdminError(res, error, 'Error fetching resolved reports for user:');
    }
}

export async function getAdminUserConversations(req, res) {
    try {
        const { userId } = req.params;
        requireObjectId(userId, 'userId');
        const { limit, skip, page } = parsePagination(req.query, 30, 100);

        const filter = { type: 'group', 'participants.userId': userId };

        const [conversations, total] = await Promise.all([
            Conversation.find(filter)
                .sort({ updatedAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Conversation.countDocuments(filter),
        ]);

        return res.status(200).json({
            conversations: conversations.map((conversation) => {
                const participant = (conversation.participants || []).find((item) => (
                    item.userId?.toString?.() || String(item.userId)
                ) === userId);
                const admins = (conversation.group?.admins || []).map((adminId) => adminId.toString());
                const role = admins.includes(userId) ? 'admin' : 'member';

                return {
                    _id: conversation._id,
                    type: conversation.type,
                    group: {
                        name: conversation.group?.name || 'Nhóm chưa đặt tên',
                        avatarUrl: conversation.group?.avatarUrl || '',
                    },
                    disbanded: conversation.disbanded,
                    participantCount: conversation.participants?.length || 0,
                    joinedAt: participant?.joinedAt || null,
                    role,
                    createdAt: conversation.createdAt,
                    updatedAt: conversation.updatedAt,
                };
            }),
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        return handleAdminError(res, error, 'Error fetching user groups:');
    }
}

export async function getAdminUserAssets(req, res) {
    try {
        const { userId } = req.params;
        requireObjectId(userId, 'userId');
        const { limit, skip, page } = parsePagination(req.query, 30, 100);
        const type = String(req.query.type || 'all');
        const allowedTypes = ['image', 'file', 'link', 'audio'];
        const filter = { senderId: userId, type: { $in: allowedTypes } };

        if (allowedTypes.includes(type)) {
            filter.type = type;
        }

        const [messages, total] = await Promise.all([
            Message.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Message.countDocuments(filter),
        ]);

        return res.status(200).json({
            assets: messages.map(serializeMessage),
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        return handleAdminError(res, error, 'Error fetching user assets:');
    }
}

export async function getAdminUserAuditLogs(req, res) {
    try {
        const { userId } = req.params;
        requireObjectId(userId, 'userId');
        const { limit, skip, page } = parsePagination(req.query, 30, 100);

        const [logs, total] = await Promise.all([
            AuditLog.find({ userId })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            AuditLog.countDocuments({ userId }),
        ]);

        return res.status(200).json({
            logs,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        return handleAdminError(res, error, 'Error fetching audit logs:');
    }
}

/*
 * Legacy implementation below intentionally removed in favor of privacy-scoped
 * group and reported-message views.
 */
/*
        const reportCounts = await Report.aggregate([
            { $match: { targetUserId: { $in: users.map((user) => user._id) }, status: { $in: ['pending', 'reviewing'] } } },
            { $group: { _id: '$targetUserId', count: { $sum: 1 } } },
        ]);

        const reportCountMap = new Map(reportCounts.map((item) => [item._id.toString(), item.count]));
        const enrichedUsers = await Promise.all(users.map(async (user) => {
            const violationSummary = await getViolationSummary(user._id);
            return toUserSummary(user, {
                online: isUserOnline(user._id),
                violationSummary,
                openReportCount: reportCountMap.get(user._id.toString()) || 0,
            });
        }));

        return res.status(200).json({
            users: enrichedUsers,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        return handleAdminError(res, error, 'Error listing admin users:');
    }
}

export async function getAdminUserProfile(req, res) {
    try {
        const { userId } = req.params;
        requireObjectId(userId, 'userId');

        const user = await User.findOne({ _id: userId, ...userRoleFilter() }).select('-password').lean();
        if (!user) {
            return res.status(404).json({ message: 'Không tìm thấy người dùng.' });
        }

        const [violationSummary, reportCounts, conversationCount, messageCount, assetCount] = await Promise.all([
            getViolationSummary(user._id),
            Report.aggregate([
                { $match: { $or: [{ reporterId: user._id }, { targetUserId: user._id }] } },
                { $group: { _id: { targetType: '$targetType', status: '$status' }, count: { $sum: 1 } } },
            ]),
            Conversation.countDocuments({ 'participants.userId': user._id }),
            Message.countDocuments({ senderId: user._id }),
            Message.countDocuments({ senderId: user._id, type: { $in: ['image', 'file', 'link', 'audio'] } }),
        ]);

        return res.status(200).json({
            user: toUserSummary(user, {
                online: isUserOnline(user._id),
                violationSummary,
                counters: {
                    reports: reportCounts,
                    conversations: conversationCount,
                    messages: messageCount,
                    assets: assetCount,
                },
            }),
        });
    } catch (error) {
        return handleAdminError(res, error, 'Error fetching admin user profile:');
    }
}

export async function getAdminUserAuditLogs(req, res) {
    try {
        const { userId } = req.params;
        requireObjectId(userId, 'userId');
        const { limit, skip, page } = parsePagination(req.query, 30, 100);

        const [logs, total] = await Promise.all([
            AuditLog.find({ userId })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            AuditLog.countDocuments({ userId }),
        ]);

        return res.status(200).json({
            logs,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        return handleAdminError(res, error, 'Error fetching audit logs:');
    }
}

export async function getAdminUserConversations(req, res) {
    try {
        const { userId } = req.params;
        requireObjectId(userId, 'userId');
        const { limit, skip, page } = parsePagination(req.query, 30, 100);

        const [conversations, total] = await Promise.all([
            Conversation.find({ 'participants.userId': userId })
                .sort({ 'lastMessage.createdAt': -1, updatedAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Conversation.countDocuments({ 'participants.userId': userId }),
        ]);

        return res.status(200).json({
            conversations: conversations.map((conversation) => ({
                _id: conversation._id,
                type: conversation.type,
                group: conversation.group,
                disbanded: conversation.disbanded,
                participantCount: conversation.participants?.length || 0,
                participants: (conversation.participants || []).map((participant) => ({
                    userId: participant.userId,
                    displayName: participant.userInfo?.displayName || '',
                    avatarUrl: participant.userInfo?.avatarUrl || '',
                    joinedAt: participant.joinedAt,
                })),
                lastMessage: conversation.lastMessage,
                updatedAt: conversation.updatedAt,
                createdAt: conversation.createdAt,
            })),
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        return handleAdminError(res, error, 'Error fetching user conversations:');
    }
}

export async function getAdminUserMessages(req, res) {
    try {
        const { userId } = req.params;
        requireObjectId(userId, 'userId');
        const { limit, skip, page } = parsePagination(req.query, 30, 100);
        const filter = { senderId: userId };

        if (req.query.conversationId) {
            requireObjectId(req.query.conversationId, 'conversationId');
            filter.conversationId = req.query.conversationId;
        }

        const [messages, total] = await Promise.all([
            Message.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Message.countDocuments(filter),
        ]);

        return res.status(200).json({
            messages: messages.map(serializeMessage),
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        return handleAdminError(res, error, 'Error fetching user messages:');
    }
}

export async function getAdminUserAssets(req, res) {
    try {
        const { userId } = req.params;
        requireObjectId(userId, 'userId');
        const { limit, skip, page } = parsePagination(req.query, 30, 100);
        const type = String(req.query.type || 'all');
        const allowedTypes = ['image', 'file', 'link', 'audio'];
        const filter = { senderId: userId, type: { $in: allowedTypes } };

        if (allowedTypes.includes(type)) {
            filter.type = type;
        }

        const [messages, total] = await Promise.all([
            Message.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Message.countDocuments(filter),
        ]);

        return res.status(200).json({
            assets: messages.map(serializeMessage),
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        return handleAdminError(res, error, 'Error fetching user assets:');
    }
}

*/

export async function addAdminUserViolation(req, res) {
    try {
        const { userId } = req.params;
        requireObjectId(userId, 'userId');
        const reason = String(req.body?.reason || '').trim();

        if (!reason) {
            return res.status(400).json({ message: 'Vui lòng nhập lý do đánh dấu vi phạm.' });
        }

        const violation = await registerViolation({
            userId,
            actorId: req.user._id,
            source: 'admin_manual',
            reason,
            metadata: { adminId: req.user._id.toString() },
        });

        return res.status(200).json({ violation });
    } catch (error) {
        return handleAdminError(res, error, 'Error adding manual violation:');
    }
}

export async function lockAdminUser(req, res) {
    try {
        const { userId } = req.params;
        requireObjectId(userId, 'userId');

        const user = await lockAccount({
            userId,
            adminId: req.user._id,
            reason: req.body?.reason || 'Tài khoản đã bị khóa.',
        });

        return res.status(200).json({ user: toUserSummary(user.toObject ? user.toObject() : user) });
    } catch (error) {
        return handleAdminError(res, error, 'Error locking user:');
    }
}

export async function unlockAdminUser(req, res) {
    try {
        const { userId } = req.params;
        requireObjectId(userId, 'userId');

        const user = await unlockAccount({
            userId,
            adminId: req.user._id,
            reason: req.body?.reason || 'Tài khoản đã được mở khóa sau khi xem xét.',
            resetViolations: req.body?.resetViolations !== false,
        });

        return res.status(200).json({ user: toUserSummary(user.toObject ? user.toObject() : user) });
    } catch (error) {
        return handleAdminError(res, error, 'Error unlocking user:');
    }
}

export async function listAdminReports(req, res) {
    try {
        const { page, limit, skip } = parsePagination(req.query, 20, 100);
        const filter = {};
        const targetType = String(req.query.targetType || '').trim();
        const status = String(req.query.status || '').trim();

        if (targetType) {
            if (!REPORT_TARGET_TYPES.includes(targetType)) {
                return res.status(400).json({ message: 'Loại báo cáo không hợp lệ.' });
            }
            filter.targetType = targetType;
        }

        if (status) {
            if (!REPORT_STATUSES.includes(status)) {
                return res.status(400).json({ message: 'Trạng thái báo cáo không hợp lệ.' });
            }
            filter.status = status;
        }

        const [reports, total] = await Promise.all([
            Report.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Report.countDocuments(filter),
        ]);

        const reportsWithEvidence = await attachReportEvidence(reports);

        return res.status(200).json({
            reports: reportsWithEvidence,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        return handleAdminError(res, error, 'Error listing reports:');
    }
}

export async function markAdminReportReviewing(req, res) {
    try {
        const { reportId } = req.params;
        requireObjectId(reportId, 'reportId');

        const report = await Report.findByIdAndUpdate(
            reportId,
            {
                $set: {
                    status: 'reviewing',
                    'review.reviewedBy': req.user._id,
                    'review.reviewedAt': new Date(),
                },
            },
            { new: true }
        ).lean();

        if (!report) {
            return res.status(404).json({ message: 'Không tìm thấy báo cáo.' });
        }

        return res.status(200).json({ report });
    } catch (error) {
        return handleAdminError(res, error, 'Error marking report reviewing:');
    }
}

export async function resolveAdminReport(req, res) {
    try {
        const { reportId } = req.params;
        requireObjectId(reportId, 'reportId');
        const decision = String(req.body?.decision || '').trim();
        const note = String(req.body?.note || '').trim();

        if (!REPORT_DECISIONS.includes(decision)) {
            return res.status(400).json({ message: 'Kết quả xử lý không hợp lệ.' });
        }

        const report = await Report.findById(reportId);
        if (!report) {
            return res.status(404).json({ message: 'Không tìm thấy báo cáo.' });
        }

        if (['resolved', 'dismissed'].includes(report.status)) {
            return res.status(409).json({ message: 'Báo cáo này đã hoàn tất vòng đời xử lý.' });
        }

        let actionTaken = '';
        let targetViolationCount = null;
        let targetLocked = false;
        let reporterMessage = '';
        let targetMessage = '';
        let evidencePreview = '';

        if (decision === 'violation') {
            let moderatedMessage = null;
            if (report.targetType === 'message' && report.targetMessageId) {
                moderatedMessage = await Message.findByIdAndUpdate(
                    report.targetMessageId,
                    {
                        $set: {
                            reportStatus: true,
                            'reportReview.reportId': report._id,
                            'reportReview.reviewedBy': req.user._id,
                            'reportReview.reviewedAt': new Date(),
                            'reportReview.note': note,
                        },
                    },
                    { new: true }
                ).lean();

                if (moderatedMessage) {
                    evidencePreview = violationEvidencePreview(moderatedMessage);
                    const conversation = await Conversation.findById(moderatedMessage.conversationId);
                    if (conversation?.lastMessage?._id?.toString?.() === moderatedMessage._id.toString()) {
                        conversation.lastMessage.content = 'Tin nhắn vi phạm tiêu chuẩn cộng đồng';
                        conversation.lastMessage.type = moderatedMessage.type;
                        await conversation.save();
                    }

                    io.to(moderatedMessage.conversationId.toString()).emit('message-moderated', {
                        conversationId: moderatedMessage.conversationId.toString(),
                        messageId: moderatedMessage._id.toString(),
                        reportStatus: true,
                        content: 'Tin nhắn vi phạm tiêu chuẩn cộng đồng',
                    });
                }
            }

            const violation = await registerViolation({
                userId: report.targetUserId,
                actorId: req.user._id,
                source: `admin_report_${report.targetType}`,
                reason: note || 'Báo cáo đã được xác nhận là vi phạm.',
                metadata: {
                    reportId: report._id.toString(),
                    targetType: report.targetType,
                    targetMessageId: report.targetMessageId?.toString?.() || null,
                },
                notify: false,
            });

            targetViolationCount = violation.count;
            targetLocked = violation.locked;
            actionTaken = violation.locked
                ? 'Đã xác nhận vi phạm và khóa tài khoản theo chính sách kiểm duyệt.'
                : 'Đã xác nhận vi phạm và ghi nhận vào hồ sơ kiểm duyệt.';
            reporterMessage = 'Chúng tôi đã xem xét báo cáo của bạn và xác nhận có vi phạm. Cảm ơn bạn đã giúp giữ cộng đồng an toàn.';
            targetMessage = report.targetType === 'message'
                ? `Một tin nhắn từ tài khoản của bạn đã bị xác nhận vi phạm tiêu chuẩn cộng đồng. Bằng chứng: ${evidencePreview || 'tin nhắn được báo cáo trong đoạn chat.'} Vui lòng xem lại nội dung trước khi gửi và không tái phạm.`
                : 'Tài khoản của bạn đã bị xác nhận có hành vi vi phạm tiêu chuẩn cộng đồng. Vui lòng điều chỉnh cách sử dụng NexCon và không tái phạm.';
        } else {
            actionTaken = 'Không xác nhận vi phạm sau khi xem xét.';
            reporterMessage = 'Chúng tôi đã xem xét báo cáo của bạn nhưng chưa đủ cơ sở xác nhận vi phạm trong trường hợp này.';
        }

        report.status = decision === 'violation' ? 'resolved' : 'dismissed';
        report.review = {
            reviewedBy: req.user._id,
            reviewedAt: new Date(),
            note,
        };
        report.resolution = {
            decision,
            actionTaken,
            targetViolationCount,
            targetLocked,
            reporterMessage,
            targetMessage,
        };
        report.expiresAt = new Date(Date.now() + COMPLETED_REPORT_TTL_MS);
        await report.save();

        await createNotification(
            report.reporterId,
            'Kết quả báo cáo của bạn',
            reporterMessage,
            `${process.env.FRONTEND_URL}/reports/my`,
            {
                type: 'report-result',
                actorId: req.user._id,
                metadata: { reportId: report._id, decision },
            }
        );

        if (decision === 'violation') {
            await createNotification(
                report.targetUserId,
                'Cảnh báo vi phạm tiêu chuẩn cộng đồng',
                targetMessage,
                `${process.env.FRONTEND_URL}/notification`,
                {
                    type: 'report-violation',
                    actorId: req.user._id,
                    metadata: { reportId: report._id, targetLocked },
                }
            );
        }

        return res.status(200).json({ report });
    } catch (error) {
        return handleAdminError(res, error, 'Error resolving report:');
    }
}

export async function listAdminAppeals(req, res) {
    try {
        const { page, limit, skip } = parsePagination(req.query, 20, 100);
        const status = String(req.query.status || '').trim();
        const filter = {};

        if (status) {
            if (!LOCK_APPEAL_STATUSES.includes(status)) {
                return res.status(400).json({ message: 'Trạng thái kháng cáo không hợp lệ.' });
            }
            filter.status = status;
        }

        const [appeals, total] = await Promise.all([
            LockAppeal.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate('userId', 'displayName email avatarUrl lock moderation')
                .lean(),
            LockAppeal.countDocuments(filter),
        ]);

        return res.status(200).json({
            appeals,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        return handleAdminError(res, error, 'Error listing appeals:');
    }
}

export async function reviewAdminAppeal(req, res) {
    try {
        const { appealId } = req.params;
        requireObjectId(appealId, 'appealId');
        const action = String(req.body?.action || '').trim();
        const adminNote = String(req.body?.adminNote || '').trim();

        if (!['approve', 'reject'].includes(action)) {
            return res.status(400).json({ message: 'Hành động kháng cáo không hợp lệ.' });
        }

        const appeal = await LockAppeal.findById(appealId);
        if (!appeal) {
            return res.status(404).json({ message: 'Không tìm thấy kháng cáo.' });
        }

        if (appeal.status !== 'pending') {
            return res.status(409).json({ message: 'Kháng cáo này đã được xử lý.' });
        }

        appeal.status = action === 'approve' ? 'approved' : 'rejected';
        appeal.reviewedBy = req.user._id;
        appeal.reviewedAt = new Date();
        appeal.adminNote = adminNote;
        appeal.expiresAt = new Date(Date.now() + COMPLETED_APPEAL_TTL_MS);
        await appeal.save();

        if (action === 'approve' && appeal.userId) {
            await unlockAccount({
                userId: appeal.userId,
                adminId: req.user._id,
                reason: adminNote || 'Tài khoản đã được mở khóa sau khi xem xét kháng cáo.',
                resetViolations: true,
            });
        } else if (appeal.userId) {
            await createNotification(
                appeal.userId,
                'Kháng cáo chưa được chấp nhận',
                adminNote || 'Sau khi xem xét, tài khoản của bạn vẫn đang bị khóa. Vui lòng chỉ gửi lại kháng cáo khi có thông tin mới.',
                `${process.env.FRONTEND_URL}/signin`,
                {
                    type: 'lock-appeal-result',
                    actorId: req.user._id,
                    metadata: { appealId: appeal._id, action },
                }
            );
        }

        return res.status(200).json({ appeal });
    } catch (error) {
        return handleAdminError(res, error, 'Error reviewing appeal:');
    }
}
