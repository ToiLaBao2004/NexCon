import { Worker } from 'bullmq';
import redisIOClient, { isRedisIOReady } from '../config/redisIOClient.js';
import Conversation from '../models/conversationModel.js';
import Message from '../models/messageModel.js';
import Reminder from '../models/reminderModel.js';
import { deleteCloudinaryResource } from '../middlewares/uploadMiddleware.js';
import { removeReminderJob } from '../config/reminderQueue.js';
import { GROUP_CLEANUP_RETENTION_DAYS, enqueueGroupCleanup, getGroupCleanupDeleteAfter } from '../config/groupCleanupQueue.js';

const MESSAGE_BATCH_SIZE = 50;
const REMINDER_BATCH_SIZE = 100;

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
                `[GroupCleanupWorker] Khong the xoa Cloudinary ${uniqueResources[index].publicId}:`,
                result.reason?.message || result.reason,
            );
        }
    });

    const failedResults = results.filter((result) => result.status === 'rejected');
    if (failedResults.length > 0) {
        throw new Error(`Cloudinary batch delete failed for ${failedResults.length} resource(s).`);
    }
}

async function cleanupGroupAvatar(conversation) {
    const avatarId = conversation.group?.avatarId;
    if (!avatarId) return;

    await deleteCloudinaryResource(avatarId, 'image');
}

async function cleanupReminders(conversationId) {
    while (true) {
        const reminders = await Reminder.find({ conversationId })
            .select('_id')
            .sort({ _id: 1 })
            .limit(REMINDER_BATCH_SIZE)
            .lean();

        if (!reminders.length) break;

        await Promise.allSettled(
            reminders.map((reminder) => removeReminderJob(reminder._id.toString()))
        );

        await Reminder.deleteMany({
            _id: { $in: reminders.map((reminder) => reminder._id) },
        });
    }
}

async function cleanupMessages(conversationId) {
    while (true) {
        const messages = await Message.find({ conversationId })
            .select('_id type filePublicId')
            .sort({ _id: 1 })
            .limit(MESSAGE_BATCH_SIZE)
            .lean();

        if (!messages.length) break;

        await deleteCloudinaryBatch(messages.map(getCloudinaryResource));

        await Message.deleteMany({
            _id: { $in: messages.map((message) => message._id) },
        });
    }
}

async function processGroupCleanup(conversationId) {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return;

    if (conversation.type !== 'group' || !conversation.disbanded) return;
    const disbandedAt = conversation.disbandedAt || conversation.createdAt || new Date();
    const deleteAfter = conversation.deleteAfter || getGroupCleanupDeleteAfter(disbandedAt);
    if (new Date(deleteAfter).getTime() > Date.now()) {
        const nextJob = await enqueueGroupCleanup(conversationId, deleteAfter);
        await Conversation.updateOne(
            { _id: conversationId },
            {
                $set: {
                    deleteAfter,
                    'cleanup.status': 'queued',
                    'cleanup.queuedAt': new Date(),
                    'cleanup.scheduledFor': deleteAfter,
                    'cleanup.retentionDays': GROUP_CLEANUP_RETENTION_DAYS,
                    ...(nextJob?.id ? { 'cleanup.jobId': nextJob.id.toString() } : {}),
                },
                $unset: {
                    'cleanup.error': 1,
                    'cleanup.failedAt': 1,
                },
            },
        );
        return;
    }

    if (conversation.cleanup?.status === 'completed') {
        await Conversation.deleteOne({ _id: conversationId, disbanded: true });
        return;
    }

    await Conversation.updateOne(
        { _id: conversationId },
        {
            $set: {
                'cleanup.status': 'processing',
                'cleanup.startedAt': new Date(),
            },
            $unset: {
                'cleanup.error': 1,
                'cleanup.failedAt': 1,
            },
        },
    );

    await cleanupGroupAvatar(conversation);
    await cleanupReminders(conversationId);
    await cleanupMessages(conversationId);

    await Conversation.updateOne(
        { _id: conversationId },
        {
            $set: {
                'cleanup.status': 'completed',
                'cleanup.completedAt': new Date(),
                lastMessage: null,
            },
            $unset: {
                'cleanup.error': 1,
                'cleanup.failedAt': 1,
                'group.avatarUrl': 1,
                'group.avatarId': 1,
            },
        },
    );

    await Conversation.deleteOne({ _id: conversationId, disbanded: true });
}

let workerInstance = null;

export function startGroupCleanupWorker() {
    if (workerInstance) return workerInstance;

    workerInstance = new Worker('group-cleanup', async (job) => {
        const { conversationId } = job.data;
        try {
            await processGroupCleanup(conversationId);
        } catch (error) {
            await Conversation.updateOne(
                { _id: conversationId },
                {
                    $set: {
                        'cleanup.status': 'failed',
                        'cleanup.failedAt': new Date(),
                        'cleanup.error': error?.message || 'Unknown cleanup error',
                    },
                },
            ).catch((updateError) => {
                console.error('[GroupCleanupWorker] Khong the cap nhat trang thai failed:', updateError);
            });
            throw error;
        }
    }, {
        connection: redisIOClient,
        concurrency: 2,
    });

    workerInstance.on('error', (err) => {
        if (err.message && !err.message.includes('ECONNREFUSED') && !err.message.includes('ECONNRESET') && !err.message.includes('Connection is closed')) {
            console.error('[GroupCleanupWorker] Loi:', err.message);
        }
    });

    return workerInstance;
}

export async function reloadPendingGroupCleanups() {
    const runReload = async () => {
        try {
            const conversations = await Conversation.find({
                type: 'group',
                disbanded: true,
                $or: [
                    { 'cleanup.status': { $exists: false } },
                    { 'cleanup.status': { $in: ['idle', 'queued', 'processing', 'failed'] } },
                ],
            }).select('_id disbandedAt deleteAfter cleanup.status').lean();

            let count = 0;
            for (const conversation of conversations) {
                const deleteAfter = conversation.deleteAfter || getGroupCleanupDeleteAfter(conversation.disbandedAt);
                const job = await enqueueGroupCleanup(conversation._id, deleteAfter);
                if (!job) continue;
                count += 1;

                await Conversation.updateOne(
                    { _id: conversation._id },
                    {
                        $set: {
                            deleteAfter,
                            'cleanup.status': 'queued',
                            'cleanup.queuedAt': new Date(),
                            'cleanup.scheduledFor': deleteAfter,
                            'cleanup.retentionDays': GROUP_CLEANUP_RETENTION_DAYS,
                            ...(job?.id ? { 'cleanup.jobId': job.id.toString() } : {}),
                        },
                        $unset: {
                            'cleanup.error': 1,
                            'cleanup.failedAt': 1,
                        },
                    },
                );
            }

            console.log(`[GroupCleanupMigration] Da reload ${count}/${conversations.length} job cleanup nhom vao Queue.`);
        } catch (error) {
            console.error('[GroupCleanupMigration] Loi reload cleanup nhom:', error);
        }
    };

    if (isRedisIOReady) {
        await runReload();
    } else {
        console.log('[GroupCleanupMigration] Cho RedisIO san sang de reload...');
        redisIOClient.once('ready', () => {
            void runReload();
        });
    }
}
