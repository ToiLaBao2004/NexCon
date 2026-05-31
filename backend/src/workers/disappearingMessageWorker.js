import { Worker } from 'bullmq';
import redisIOClient, { isRedisIOReady } from '../config/redisIOClient.js';
import { scheduleDisappearingMessageExpirySweep } from '../config/disappearingMessageQueue.js';
import { expireDueMessages } from '../services/disappearingMessageService.js';

let workerInstance = null;

export function startDisappearingMessageWorker() {
    if (workerInstance) return workerInstance;

    workerInstance = new Worker('dm-disappearing-expiry', async () => {
        await expireDueMessages();
    }, {
        connection: redisIOClient,
        concurrency: 1,
    });

    workerInstance.on('error', (error) => {
        if (!error.message?.includes('ECONNREFUSED') && !error.message?.includes('ECONNRESET')) {
            console.error('[DisappearingMessageWorker] Error:', error.message);
        }
    });

    return workerInstance;
}

export async function ensureDisappearingMessageExpirySweep() {
    const schedule = async () => {
        try {
            await scheduleDisappearingMessageExpirySweep();
            console.log('[DisappearingMessageWorker] Scheduled one expiry sweep per minute.');
        } catch (error) {
            console.error('[DisappearingMessageWorker] Cannot schedule expiry sweep:', error.message);
        }
    };

    if (isRedisIOReady) {
        await schedule();
        return;
    }

    redisIOClient.once('ready', () => {
        void schedule();
    });
}
