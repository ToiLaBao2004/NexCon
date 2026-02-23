import Conversation from '../models/conversationModel.js';
import Message from '../models/messageModel.js';
import Friend from '../models/friendModel.js';
import { io } from '../socket/index.js';

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

        const formatted = conversations.map((convo) => ({
            ...convo.toObject(),
            unreadCounts: convo.unreadCounts || {},
        }));
        
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

export async function getUserConversationsForSocketIO (userId) {
    try {
        const conversations = await Conversation.find({"participants.userId" : userId},
        { _id: 1}
        );
        return conversations.map((c) => c._id.toString());
    } catch (error) {
        console.error("An error occurred while fetching conversations: ", error);
        return[];
    }
}

export async function markAsSeen(req, res) {
    try {
        const {conversationId} = req.params;
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
                $set:{ [`unreadCounts.${userId}`]: 0 },

            }, { new: true }
        );

        io.to(conversationId).emit("read-message", {
            conversationId: updated,
            lastMessage: {
                _id: updated.lastMessage._id,
                content: updated.lastMessage.content,
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