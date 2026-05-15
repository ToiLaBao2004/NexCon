import { Worker } from 'bullmq';
import redisIOClient, { isRedisIOReady } from '../config/redisIOClient.js';
import Conversation from '../models/conversationModel.js';
import Message from '../models/messageModel.js';
import { deleteCloudinaryResource } from '../middlewares/uploadMiddleware.js';
import { enqueueConversationClearCleanup } from '../config/conversationClearCleanupQueue.js';
import { decryptMessagePayload, encryptText } from '../utils/messageCrypto.js';

const MESSAGE_BATCH_SIZE = 50;

function getCloudinaryResource(message) {
    if (!message?.filePublicId) return null;

    if (message.type === 'image') {
        return {
            publicId: message.filePublicId,
            resourceType: 'image',
            deliveryType: 'authenticated',
        };
    }

    if (message.type === 'file' || message.type === 'audio') {
        return {
            publicId: message.filePublicId,
            resourceType: 'raw',
            deliveryType: 'authenticated',
        };
    }

    return null;
}

function getSafeCleanupCutoff(conversation, requestedCutoff) {
    const cutoff = new Date(requestedCutoff);
    if (Number.isNaN(cutoff.getTime())) return null;

    const clearTimes = (conversation.participants || [])
        .map((participant) => participant.clearedAt ? new Date(participant.clearedAt) : null);

    if (clearTimes.length === 0 || clearTimes.some((date) => !date || Number.isNaN(date.getTime()))) {
        return null;
    }

    const allClearedBeforeOrAtCutoff = clearTimes.every((date) => date.getTime() >= cutoff.getTime());
    return allClearedBeforeOrAtCutoff ? cutoff : null;
}

async function deleteCloudinaryBatch(resources) {
    const uniqueResources = [
        ...new Map(
            resources
                .filter(Boolean)
                .map((resource) => [
                    `${resource.resourceType}:${resource.deliveryType}:${resource.publicId}`,
                    resource,
                ])
        ).values(),
    ];

    const results = await Promise.allSettled(
        uniqueResources.map((resource) => (
            deleteCloudinaryResource(resource.publicId, resource.resourceType, resource.deliveryType)
        ))
    );

    results.forEach((result, index) => {
        if (result.status === 'rejected') {
            console.warn(
                `[ConversationClearCleanupWorker] Khong the xoa Cloudinary ${uniqueResources[index].publicId}:`,
                result.reason?.message || result.reason,
            );
        }
    });

    const failedResults = results.filter((result) => result.status === 'rejected');
    if (failedResults.length > 0) {
        throw new Error(`Cloudinary batch delete failed for ${failedResults.length} resource(s).`);
    }
}

async function refreshLastMessage(conversationId) {
    const latestMessage = await Message.findOne({ conversationId })
        .sort({ createdAt: -1 })
        .lean();

    if (!latestMessage) {
        await Conversation.updateOne(
            { _id: conversationId },
            { $unset: { lastMessage: 1 } },
        );
        return;
    }

    const safeLatestMessage = decryptMessagePayload(latestMessage);

    await Conversation.updateOne(
        { _id: conversationId },
        {
            $set: {
                lastMessage: {
                    _id: safeLatestMessage._id,
                    content: encryptText(safeLatestMessage.content),
                    type: safeLatestMessage.type,
                    systemType: safeLatestMessage.systemType || null,
                    metadata: safeLatestMessage.metadata instanceof Map
                        ? Object.fromEntries(safeLatestMessage.metadata)
                        : (safeLatestMessage.metadata || null),
                    senderId: safeLatestMessage.senderId,
                    createdAt: safeLatestMessage.createdAt,
                },
            },
        },
    );
}

async function cleanupMessages(conversationId, cleanupBefore) {
    let deletedAny = false;

    while (true) {
        const messages = await Message.find({
            conversationId,
            createdAt: { $lte: cleanupBefore },
        })
            .select('_id type filePublicId')
            .sort({ _id: 1 })
            .limit(MESSAGE_BATCH_SIZE)
            .lean();

        if (!messages.length) break;

        await deleteCloudinaryBatch(messages.map(getCloudinaryResource));

        await Message.deleteMany({
            _id: { $in: messages.map((message) => message._id) },
        });
        deletedAny = true;
    }

    if (deletedAny) {
        await refreshLastMessage(conversationId);
    }
}

async function processConversationClearCleanup(conversationId, requestedCutoff) {
    const conversation = await Conversation.findById(conversationId).select('participants').lean();
    if (!conversation) return;

    const cleanupBefore = getSafeCleanupCutoff(conversation, requestedCutoff);
    if (!cleanupBefore) return;

    await cleanupMessages(conversationId, cleanupBefore);
}

let workerInstance = null;

export function startConversationClearCleanupWorker() {
    if (workerInstance) return workerInstance;

    workerInstance = new Worker('conversation-clear-cleanup', async (job) => {
        const { conversationId, cleanupBefore } = job.data;
        await processConversationClearCleanup(conversationId, cleanupBefore);
    }, {
        connection: redisIOClient,
        concurrency: 2,
    });

    workerInstance.on('error', (err) => {
        if (err.message && !err.message.includes('ECONNREFUSED') && !err.message.includes('ECONNRESET') && !err.message.includes('Connection is closed')) {
            console.error('[ConversationClearCleanupWorker] Loi:', err.message);
        }
    });

    return workerInstance;
}

export async function reloadPendingConversationClearCleanups() {
    const runReload = async () => {
        try {
            const conversations = await Conversation.find({
                participants: {
                    $not: {
                        $elemMatch: {
                            $or: [
                                { clearedAt: { $exists: false } },
                                { clearedAt: null },
                            ],
                        },
                    },
                },
            }).select('_id participants.clearedAt').lean();

            let count = 0;
            for (const conversation of conversations) {
                const clearTimes = (conversation.participants || [])
                    .map((participant) => participant.clearedAt ? new Date(participant.clearedAt) : null);
                if (clearTimes.length === 0 || clearTimes.some((date) => !date || Number.isNaN(date.getTime()))) {
                    continue;
                }

                const cleanupBefore = new Date(Math.min(...clearTimes.map((date) => date.getTime())));
                const hasDeletableMessages = await Message.exists({
                    conversationId: conversation._id,
                    createdAt: { $lte: cleanupBefore },
                });

                if (!hasDeletableMessages) continue;

                const job = await enqueueConversationClearCleanup(conversation._id, cleanupBefore);
                if (job) count += 1;
            }

            console.log(`[ConversationClearCleanupMigration] Da reload ${count}/${conversations.length} job cleanup conversation-clear vao Queue.`);
        } catch (error) {
            console.error('[ConversationClearCleanupMigration] Loi reload cleanup conversation-clear:', error);
        }
    };

    if (isRedisIOReady) {
        await runReload();
    } else {
        console.log('[ConversationClearCleanupMigration] Cho RedisIO san sang de reload...');
        redisIOClient.once('ready', () => {
            void runReload();
        });
    }
}
