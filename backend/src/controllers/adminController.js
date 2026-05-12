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
import { isUserOnline } from '../socket/index.js';

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

function serializeMessage(message) {
    const raw = message?.toObject ? message.toObject() : message;
    if (!raw) return null;

    return {
        ...raw,
        signedUrl: raw.filePublicId ? generateSignedUrl(raw.filePublicId, raw.type) : null,
        preview: messagePreview(raw),
    };
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
            reason: req.body?.reason || 'Admin khóa tài khoản sau khi xem xét bằng chứng.',
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
            reason: req.body?.reason || 'Admin đã mở khóa tài khoản sau khi xem xét.',
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

        return res.status(200).json({
            reports,
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

        if (decision === 'violation') {
            if (report.targetType === 'message' && report.targetMessageId) {
                await Message.findByIdAndUpdate(report.targetMessageId, {
                    $set: {
                        reportStatus: true,
                        'reportReview.reportId': report._id,
                        'reportReview.reviewedBy': req.user._id,
                        'reportReview.reviewedAt': new Date(),
                        'reportReview.note': note,
                    },
                });
            }

            const violation = await registerViolation({
                userId: report.targetUserId,
                actorId: req.user._id,
                source: `admin_report_${report.targetType}`,
                reason: note || 'Admin xác nhận báo cáo vi phạm.',
                metadata: {
                    reportId: report._id.toString(),
                    targetType: report.targetType,
                    targetMessageId: report.targetMessageId?.toString?.() || null,
                },
            });

            targetViolationCount = violation.count;
            targetLocked = violation.locked;
            actionTaken = violation.locked
                ? 'Đã xác nhận vi phạm, tăng số lần vi phạm và khóa tài khoản.'
                : 'Đã xác nhận vi phạm và tăng số lần vi phạm.';
            reporterMessage = 'Cảm ơn bạn đã báo cáo. Sau khi xem xét, chúng tôi xác nhận nội dung/người dùng này vi phạm tiêu chuẩn cộng đồng và đã áp dụng biện pháp phù hợp.';
            targetMessage = `Báo cáo liên quan đến tài khoản của bạn đã được xác nhận là vi phạm. Số lần vi phạm hiện tại: ${violation.count}/${violation.threshold}.`;
        } else {
            actionTaken = 'Không xác nhận vi phạm sau khi xem xét.';
            reporterMessage = 'Cảm ơn bạn đã báo cáo. Sau khi xem xét, chúng tôi chưa tìm thấy vi phạm trong trường hợp này.';
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
                'Báo cáo vi phạm đã được xác nhận',
                targetMessage,
                `${process.env.FRONTEND_URL}/notification`,
                {
                    type: 'report-violation',
                    actorId: req.user._id,
                    metadata: { reportId: report._id, targetViolationCount, targetLocked },
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
                reason: adminNote || 'Kháng cáo khóa tài khoản đã được chấp nhận.',
                resetViolations: true,
            });
        } else if (appeal.userId) {
            await createNotification(
                appeal.userId,
                'Kháng cáo khóa tài khoản bị từ chối',
                adminNote || 'Sau khi xem xét, admin quyết định giữ trạng thái khóa tài khoản.',
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
