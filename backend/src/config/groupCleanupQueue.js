import { Queue, QueueEvents } from 'bullmq';
import redisIOClient from './redisIOClient.js';

const QUEUE_NAME = 'group-cleanup';
export const GROUP_CLEANUP_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export function getGroupCleanupDeleteAfter(disbandedAt = new Date()) {
    const start = disbandedAt ? new Date(disbandedAt) : new Date();
    const startTime = Number.isFinite(start.getTime()) ? start.getTime() : Date.now();
    return new Date(startTime + GROUP_CLEANUP_RETENTION_DAYS * DAY_MS);
}

export function getGroupCleanupDelay(deleteAfter) {
    if (!deleteAfter) return 0;
    const deleteAfterTime = new Date(deleteAfter).getTime();
    if (!Number.isFinite(deleteAfterTime)) return 0;
    return Math.max(deleteAfterTime - Date.now(), 0);
}

export const groupCleanupQueue = new Queue(QUEUE_NAME, {
    connection: redisIOClient,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: 100,
    },
});

export const groupCleanupQueueEvents = new QueueEvents(QUEUE_NAME, {
    connection: redisIOClient,
});

groupCleanupQueue.on('error', (err) => {
    if (err.message && !err.message.includes('ECONNREFUSED') && !err.message.includes('ECONNRESET') && !err.message.includes('Connection is closed')) {
        console.error('[GroupCleanupQueue] Loi Queue:', err.message);
    }
});

groupCleanupQueueEvents.on('error', (err) => {
    if (err.message && !err.message.includes('ECONNREFUSED') && !err.message.includes('ECONNRESET') && !err.message.includes('Connection is closed')) {
        console.error('[GroupCleanupQueue] Loi QueueEvents:', err.message);
    }
});

export async function enqueueGroupCleanup(conversationId, deleteAfter = null) {
    if (!conversationId) return null;

    const id = conversationId.toString();
    const delay = getGroupCleanupDelay(deleteAfter);
    const scheduledFor = deleteAfter ? new Date(deleteAfter) : new Date();
    const scheduledAt = scheduledFor.getTime();

    return groupCleanupQueue.add(
        'cleanup',
        { conversationId: id },
        {
            jobId: `group-cleanup-${id}-${Number.isFinite(scheduledAt) ? scheduledAt : Date.now()}`,
            delay,
        },
    );
}
