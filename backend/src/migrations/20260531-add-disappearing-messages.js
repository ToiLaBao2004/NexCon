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
    const legacyConversationResult = await Conversation.collection.updateMany(
        { disappearingDurationSeconds: { $exists: true } },
        [
            {
                $set: {
                    disappearingAutoDisableSeconds: {
                        $ifNull: ['$disappearingAutoDisableSeconds', '$disappearingDurationSeconds'],
                    },
                },
            },
            { $unset: 'disappearingDurationSeconds' },
        ],
    );
    const activeConversationResult = await Conversation.collection.updateMany(
        {
            disappearingEnabled: true,
            $or: [
                { disappearingDisableAt: { $exists: false } },
                { disappearingDisableAt: null },
            ],
        },
        [
            {
                $set: {
                    disappearingAutoDisableSeconds: {
                        $ifNull: ['$disappearingAutoDisableSeconds', 24 * 60 * 60],
                    },
                    disappearingDisableAt: {
                        $add: [
                            { $ifNull: ['$disappearingEnabledAt', '$$NOW'] },
                            {
                                $multiply: [
                                    { $ifNull: ['$disappearingAutoDisableSeconds', 24 * 60 * 60] },
                                    1000,
                                ],
                            },
                        ],
                    },
                },
            },
        ],
    );
    const messageExpiryResult = await Message.collection.updateMany(
        {
            isExpired: { $ne: true },
            expiresAt: { $exists: true, $ne: null },
        },
        [
            {
                $set: {
                    expiresAt: {
                        $add: [
                            { $ifNull: ['$deliveryStartedAt', '$createdAt'] },
                            24 * 60 * 60 * 1000,
                        ],
                    },
                },
            },
        ],
    );
    const legacyMessageResult = await Message.collection.updateMany(
        { disappearingDurationSeconds: { $exists: true } },
        { $unset: { disappearingDurationSeconds: '' } },
    );
    await Promise.all([
        Conversation.syncIndexes(),
        Message.syncIndexes(),
    ]);

    console.log('[Migration] Disappearing messages schema is ready.', {
        conversationsUpdated: conversationResult.modifiedCount,
        messagesUpdated: messageResult.modifiedCount,
        legacyConversationsUpdated: legacyConversationResult.modifiedCount,
        activeConversationsScheduledToDisable: activeConversationResult.modifiedCount,
        messageExpiryTimestampsNormalized: messageExpiryResult.modifiedCount,
        legacyMessagesUpdated: legacyMessageResult.modifiedCount,
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
