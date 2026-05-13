import { Queue, QueueEvents } from 'bullmq';
import redisIOClient from './redisIOClient.js';

const QUEUE_NAME = 'group-cleanup';

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

export async function enqueueGroupCleanup(conversationId) {
    if (!conversationId) return null;

    const id = conversationId.toString();
    return groupCleanupQueue.add(
        'cleanup',
        { conversationId: id },
        {
            jobId: id,
        },
    );
}
