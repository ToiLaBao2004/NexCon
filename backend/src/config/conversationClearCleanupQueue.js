import { Queue, QueueEvents } from 'bullmq';
import redisIOClient from './redisIOClient.js';

const QUEUE_NAME = 'conversation-clear-cleanup';

export const conversationClearCleanupQueue = new Queue(QUEUE_NAME, {
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

export const conversationClearCleanupQueueEvents = new QueueEvents(QUEUE_NAME, {
    connection: redisIOClient,
});

conversationClearCleanupQueue.on('error', (err) => {
    if (err.message && !err.message.includes('ECONNREFUSED') && !err.message.includes('ECONNRESET') && !err.message.includes('Connection is closed')) {
        console.error('[ConversationClearCleanupQueue] Loi Queue:', err.message);
    }
});

conversationClearCleanupQueueEvents.on('error', (err) => {
    if (err.message && !err.message.includes('ECONNREFUSED') && !err.message.includes('ECONNRESET') && !err.message.includes('Connection is closed')) {
        console.error('[ConversationClearCleanupQueue] Loi QueueEvents:', err.message);
    }
});

export async function enqueueConversationClearCleanup(conversationId, cleanupBefore) {
    if (!conversationId || !cleanupBefore) return null;

    const id = conversationId.toString();
    const cutoff = new Date(cleanupBefore);
    if (Number.isNaN(cutoff.getTime())) return null;

    return conversationClearCleanupQueue.add(
        'cleanup-cleared-messages',
        {
            conversationId: id,
            cleanupBefore: cutoff.toISOString(),
        },
        {
            jobId: `${id}-${cutoff.getTime()}`,
        },
    );
}
