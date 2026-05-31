import { Queue, QueueEvents } from 'bullmq';
import redisIOClient from './redisIOClient.js';

const QUEUE_NAME = 'dm-disappearing-expiry';
const EXPIRY_SWEEP_INTERVAL_MS = 60 * 1000;
const EXPIRY_SWEEP_JOB_ID = 'dm-disappearing-expiry-sweep';

export const disappearingMessageQueue = new Queue(QUEUE_NAME, {
    connection: redisIOClient,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000,
        },
        removeOnComplete: 100,
        removeOnFail: 100,
    },
});

export const disappearingMessageQueueEvents = new QueueEvents(QUEUE_NAME, {
    connection: redisIOClient,
});

disappearingMessageQueue.on('error', (error) => {
    if (!error.message?.includes('ECONNREFUSED') && !error.message?.includes('ECONNRESET')) {
        console.error('[DisappearingMessageQueue] Error:', error.message);
    }
});

disappearingMessageQueueEvents.on('error', (error) => {
    if (!error.message?.includes('ECONNREFUSED') && !error.message?.includes('ECONNRESET')) {
        console.error('[DisappearingMessageQueueEvents] Error:', error.message);
    }
});

export async function scheduleDisappearingMessageExpirySweep() {
    return disappearingMessageQueue.add(
        'expire-batch',
        {},
        {
            jobId: EXPIRY_SWEEP_JOB_ID,
            repeat: {
                every: EXPIRY_SWEEP_INTERVAL_MS,
            },
        },
    );
}
