import {
    createMessageAppeal,
    listMessageAppealsForAdmin,
    reviewMessageAppeal,
} from '../services/messageAppealService.js';

function handleAppealError(res, error, label) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) {
        console.error(label, error);
        return res.status(500).json({ message: 'Không thể xử lý yêu cầu kháng cáo.' });
    }

    return res.status(statusCode).json({
        message: error.message || 'Yêu cầu không hợp lệ.',
        ...(error.code ? { code: error.code } : {}),
        ...(error.appeal ? { appeal: error.appeal } : {}),
    });
}

export async function submitMessageAppeal(req, res) {
    try {
        const appeal = await createMessageAppeal({
            messageId: req.params.messageId,
            requesterId: req.user._id,
            reason: req.body?.reason,
        });

        return res.status(201).json({
            message: 'Đã gửi kháng cáo. Vui lòng chờ admin xem xét.',
            appeal,
        });
    } catch (error) {
        return handleAppealError(res, error, 'Error submitting message appeal:');
    }
}

export async function listAdminMessageAppeals(req, res) {
    try {
        const result = await listMessageAppealsForAdmin({
            status: req.query.status,
            page: req.query.page,
            limit: req.query.limit,
        });

        return res.status(200).json(result);
    } catch (error) {
        return handleAppealError(res, error, 'Error listing message appeals:');
    }
}

export async function reviewAdminMessageAppeal(req, res) {
    try {
        const result = await reviewMessageAppeal({
            appealId: req.params.appealId,
            action: req.body?.action,
            adminId: req.user._id,
            adminNote: req.body?.adminNote,
        });

        return res.status(200).json(result);
    } catch (error) {
        return handleAppealError(res, error, 'Error reviewing message appeal:');
    }
}
