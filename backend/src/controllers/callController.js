import Call from '../models/callModel.js';
import Conversation from '../models/conversationModel.js';

// Lấy lịch sử cuộc gọi của user hiện tại
export async function getCallHistory(req, res) {
    try {
        const userId = req.user._id;
        const { limit = 20, cursor } = req.query;
        const parsedLimit = Math.min(Number(limit) || 20, 50);

        const query = { 'participants.userId': userId };
        if (cursor) {
            query.createdAt = { $lt: new Date(cursor) };
        }

        let calls = await Call.find(query)
            .sort({ createdAt: -1 })
            .limit(parsedLimit + 1)
            .populate('initiatorUser', 'displayName avatarUrl email bio phone')
            .populate('participants.userId', 'displayName avatarUrl email bio phone')
            .populate('conversationId', 'type group')
            .lean();

        let nextCursor = null;
        if (calls.length > parsedLimit) {
            const lastCall = calls[calls.length - 1];
            nextCursor = lastCall.createdAt.toISOString();
            calls.pop();
        }

        return res.status(200).json({ calls, nextCursor });
    } catch (error) {
        console.error('Get call history error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
}

// Lấy lịch sử cuộc gọi theo conversation
export async function getCallsByConversation(req, res) {
    try {
        const userId = req.user._id;
        const { conversationId } = req.params;
        const { limit = 20, cursor } = req.query;
        const parsedLimit = Math.min(Number(limit) || 20, 50);

        // Kiểm tra user có thuộc conversation không
        const conversation = await Conversation.findById(conversationId).lean();
        if (!conversation) {
            return res.status(404).json({ message: 'Conversation not found.' });
        }
        const isMember = conversation.participants.some(
            p => p.userId.toString() === userId.toString()
        );
        if (!isMember) {
            return res.status(403).json({ message: 'You are not a member of this conversation.' });
        }

        const query = { conversationId };
        if (cursor) {
            query.createdAt = { $lt: new Date(cursor) };
        }

        let calls = await Call.find(query)
            .sort({ createdAt: -1 })
            .limit(parsedLimit + 1)
            .populate('initiatorUser', 'displayName avatarUrl email bio phone')
            .populate('participants.userId', 'displayName avatarUrl email bio phone')
            .lean();

        let nextCursor = null;
        if (calls.length > parsedLimit) {
            const lastCall = calls[calls.length - 1];
            nextCursor = lastCall.createdAt.toISOString();
            calls.pop();
        }

        return res.status(200).json({ calls, nextCursor });
    } catch (error) {
        console.error('Get calls by conversation error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
}

// Lấy chi tiết một cuộc gọi
export async function getCallDetail(req, res) {
    try {
        const userId = req.user._id;
        const { callId } = req.params;

        const call = await Call.findById(callId)
            .populate('initiatorUser', 'displayName avatarUrl email bio phone')
            .populate('participants.userId', 'displayName avatarUrl email bio phone')
            .populate('conversationId', 'type group')
            .lean();

        if (!call) {
            return res.status(404).json({ message: 'Call not found.' });
        }

        // Kiểm tra user có phải participant không
        const isParticipant = call.participants.some(
            p => p.userId._id.toString() === userId.toString()
        );
        if (!isParticipant) {
            return res.status(403).json({ message: 'You are not a participant of this call.' });
        }

        return res.status(200).json({ call });
    } catch (error) {
        console.error('Get call detail error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
}
