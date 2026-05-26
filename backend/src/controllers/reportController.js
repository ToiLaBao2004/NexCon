import mongoose from 'mongoose';
import Report, { REPORT_REASON_CATEGORIES } from '../models/reportModel.js';
import User from '../models/userModel.js';
import Message from '../models/messageModel.js';
import Conversation from '../models/conversationModel.js';
import { replaceMentionTags } from '../utils/mentions.js';

const ACTIVE_REPORT_STATUSES = ['pending', 'reviewing'];
const MAX_DESCRIPTION_LENGTH = 1000;

const normalizeReportPayload = (body) => {
    const reasonCategory = String(body?.reasonCategory || '').trim();
    const description = String(body?.description || '').trim();

    if (!REPORT_REASON_CATEGORIES.includes(reasonCategory)) {
        const error = new Error('Lý do báo cáo không hợp lệ.');
        error.statusCode = 400;
        throw error;
    }

    if (description.length > MAX_DESCRIPTION_LENGTH) {
        const error = new Error(`Mô tả không được vượt quá ${MAX_DESCRIPTION_LENGTH} ký tự.`);
        error.statusCode = 400;
        throw error;
    }

    return { reasonCategory, description };
};

const buildUserSnapshot = (user) => ({
    displayName: user?.displayName || '',
    email: user?.email || '',
    ...(user?.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
});

const buildMessageSnapshot = (message) => {
    const content = replaceMentionTags(message?.content || '', message?.mentions);

    return {
        ...(message?.type ? { type: message.type } : {}),
        ...(content ? { content } : {}),
        ...(message?.fileName ? { fileName: message.fileName } : {}),
        ...(message?.mimeType ? { mimeType: message.mimeType } : {}),
        ...(message?.createdAt ? { createdAt: message.createdAt } : {}),
        ...(message?.senderInfo ? { senderInfo: message.senderInfo } : {}),
    };
};

const ensureObjectId = (value, fieldName) => {
    if (!mongoose.Types.ObjectId.isValid(value)) {
        const error = new Error(`${fieldName} không hợp lệ.`);
        error.statusCode = 400;
        throw error;
    }
};

const handleReportError = (res, error, logLabel) => {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) {
        console.error(logLabel, error);
        return res.status(500).json({ message: 'Không thể gửi báo cáo. Vui lòng thử lại.' });
    }
    return res.status(statusCode).json({ message: error.message || 'Internal server error.' });
};

export async function createMessageReport(req, res) {
    try {
        const reporter = req.user;
        const { messageId } = req.params;
        ensureObjectId(messageId, 'messageId');

        const { reasonCategory, description } = normalizeReportPayload(req.body);
        const message = await Message.findById(messageId);

        if (!message) {
            return res.status(404).json({ message: 'Tin nhắn không tồn tại.' });
        }

        if (message.type === 'system') {
            return res.status(400).json({ message: 'Không thể báo cáo tin nhắn hệ thống.' });
        }

        if (message.senderId.toString() === reporter._id.toString()) {
            return res.status(400).json({ message: 'Bạn không thể báo cáo tin nhắn của chính mình.' });
        }

        const conversation = await Conversation.findOne({
            _id: message.conversationId,
            'participants.userId': reporter._id,
        });

        if (!conversation) {
            return res.status(403).json({ message: 'Bạn không có quyền báo cáo tin nhắn này.' });
        }

        const targetUser = await User.findById(message.senderId).select('displayName email avatarUrl');
        if (!targetUser) {
            return res.status(404).json({ message: 'Người gửi tin nhắn không tồn tại.' });
        }

        const existingReport = await Report.findOne({
            reporterId: reporter._id,
            targetType: 'message',
            targetMessageId: message._id,
            status: { $in: ACTIVE_REPORT_STATUSES },
        });

        if (existingReport) {
            return res.status(409).json({ message: 'Bạn đã báo cáo tin nhắn này và báo cáo đang chờ xử lý.' });
        }

        const report = await Report.create({
            reporterId: reporter._id,
            targetType: 'message',
            targetUserId: targetUser._id,
            targetMessageId: message._id,
            conversationId: conversation._id,
            reasonCategory,
            ...(description ? { description } : {}),
            reporterSnapshot: buildUserSnapshot(reporter),
            targetUserSnapshot: buildUserSnapshot(targetUser),
            messageSnapshot: buildMessageSnapshot(message),
        });

        return res.status(201).json({
            message: 'Đã gửi báo cáo tin nhắn.',
            report: {
                _id: report._id,
                targetType: report.targetType,
                status: report.status,
                createdAt: report.createdAt,
            },
        });
    } catch (error) {
        return handleReportError(res, error, 'Error creating message report:');
    }
}

export async function createUserReport(req, res) {
    try {
        const reporter = req.user;
        const { userId } = req.params;
        ensureObjectId(userId, 'userId');

        if (userId === reporter._id.toString()) {
            return res.status(400).json({ message: 'Bạn không thể báo cáo chính mình.' });
        }

        const { reasonCategory, description } = normalizeReportPayload(req.body);
        const targetUser = await User.findById(userId).select('displayName email avatarUrl');

        if (!targetUser) {
            return res.status(404).json({ message: 'Người dùng không tồn tại.' });
        }

        let conversation = null;
        const conversationId = String(req.body?.conversationId || '').trim();
        if (conversationId) {
            ensureObjectId(conversationId, 'conversationId');
            conversation = await Conversation.findOne({
                _id: conversationId,
                'participants.userId': { $all: [reporter._id, targetUser._id] },
            }).select('_id');

            if (!conversation) {
                return res.status(403).json({ message: 'Bạn không có quyền gắn hội thoại này vào báo cáo.' });
            }
        }

        const existingReport = await Report.findOne({
            reporterId: reporter._id,
            targetType: 'user',
            targetUserId: targetUser._id,
            status: { $in: ACTIVE_REPORT_STATUSES },
        });

        if (existingReport) {
            return res.status(409).json({ message: 'Bạn đã báo cáo người dùng này và báo cáo đang chờ xử lý.' });
        }

        const report = await Report.create({
            reporterId: reporter._id,
            targetType: 'user',
            targetUserId: targetUser._id,
            reasonCategory,
            ...(conversation ? { conversationId: conversation._id } : {}),
            ...(description ? { description } : {}),
            reporterSnapshot: buildUserSnapshot(reporter),
            targetUserSnapshot: buildUserSnapshot(targetUser),
        });

        return res.status(201).json({
            message: 'Đã gửi báo cáo người dùng.',
            report: {
                _id: report._id,
                targetType: report.targetType,
                status: report.status,
                createdAt: report.createdAt,
            },
        });
    } catch (error) {
        return handleReportError(res, error, 'Error creating user report:');
    }
}

export async function getMyReports(req, res) {
    try {
        const reports = await Report.find({ reporterId: req.user._id })
            .sort({ createdAt: -1 })
            .limit(50)
            .select('targetType targetUserId targetMessageId conversationId reasonCategory description status createdAt updatedAt targetUserSnapshot messageSnapshot review resolution')
            .lean();

        return res.status(200).json({ reports });
    } catch (error) {
        return handleReportError(res, error, 'Error fetching my reports:');
    }
}
