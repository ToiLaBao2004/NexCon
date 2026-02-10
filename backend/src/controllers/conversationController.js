import Conversation from '../models/conversationModel.js';
import Message from '../models/messageModel.js';
import Friend from '../models/friendModel.js';

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
            conversation = await Conversation.findOne({type: 'direct','participants.userId': { $all: [userId, participantId] }});
            if (!conversation) {
                conversation = new Conversation({
                    type: 'direct',
                    participants: [
                        { userId: userId, joinedAt: new Date() }, 
                        { userId: participantId, joinedAt: new Date() }
                    ]});
                conversation = await Conversation.create(conversation);
            }
        }
        if (type === 'group') {
            const participants = memberIds.map(id => ({ userId: id, joinedAt: new Date() }));
            participants.push({ userId: userId, joinedAt: new Date() });
            conversation = new Conversation({
                type: 'group',
                group: { name: name, createdBy: userId },
                participants: participants
            });
            conversation = await Conversation.create(conversation);
        }
        if (!conversation) {
            return res.status(400).json({ message: 'Failed to create conversation.' });
        }
        await conversation.populate([
            { path: 'participants.userId', select: 'displayName avatarUrl' },
            { path: 'seenBy', select: 'displayName avatarUrl' },
            { path: 'lastMessage.senderId', select: 'displayName avatarUrl' }
        ]);
        res.status(201).json({conversation});
    } catch (error) {
        console.error('Error creating conversation:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

export async function getConversations(req, res) {
    try {
        const userId = req.user._id;
        const conversations = await Conversation.find({'participants.userId': userId})
        .sort({updatedAt:-1})
        .populate({
            path: "participants.userId",
            select: "displayName avatarUrl",
        })
        .populate({
            path: "lastMessage.senderId",
            select: "displayName avatarUrl",
        })
        .populate({
            path: "seenBy",
            select: "displayName avatarUrl",
        })

        const formatted = conversations.map((convo) => {
            const participants = (convo.participants || []).map((p) => ({
                _id: p.userId?._id,
                displayName: p.userId?.displayName,
                avatarUrl: p.userId?.avatarUrl ?? null,
                joinedAt: p.joinedAt,
            }));
            return {
            ...convo.toObject(),
            unreadCounts: convo.unreadCounts || {},
            participants,
            };
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
    const query = {conversationId};
    if (cursor) {
       query.createdAt = {$lt: new Date(cursor)} 
    }

    let messages = await Message.find(query)
    .sort({createdAt:-1})
    .limit(Number(limit) + 1);

    let nextCursor = null;

    if (messages.length > Number(limit)) {
        const nextMessage = messages[messages.length - 1];
        nextCursor = nextMessage.createdAt.toISOString();
        messages.pop();
    }

    messages = messages.reverse();

    return res.status(200).json({
        messages,
        nextCursor,
    });

  } catch (error) {
    console.error("Error occurred while fetching messages", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}