import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import Conversation from '../models/conversationModel.js';
import Message from '../models/messageModel.js';

async function run() {
    await connectDB();

    const conversationResult = await Conversation.updateMany(
        { disappearingEnabled: { $exists: false } },
        { $set: { disappearingEnabled: false } },
    );
    const messageResult = await Message.updateMany(
        { isExpired: { $exists: false } },
        { $set: { isExpired: false } },
    );
    const directResult = await Conversation.collection.updateMany(
        {
            type: 'direct',
            initiatedBy: { $exists: false },
            'participants.0.userId': { $exists: true },
        },
        [{
            $set: {
                initiatedBy: { $arrayElemAt: ['$participants.userId', 0] },
            },
        }],
    );

    await Promise.all([
        Conversation.syncIndexes(),
        Message.syncIndexes(),
    ]);

    console.log('[Migration] Disappearing messages schema is ready.', {
        conversationsUpdated: conversationResult.modifiedCount,
        messagesUpdated: messageResult.modifiedCount,
        directInitiatorsBackfilled: directResult.modifiedCount,
    });
}

run()
    .catch((error) => {
        console.error('[Migration] Failed to add disappearing messages:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
