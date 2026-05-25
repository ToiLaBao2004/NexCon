import { Worker } from 'bullmq';
import redisIOClient from '../config/redisIOClient.js';
import { REALTIME_TIMEOUT_QUEUE_NAME } from '../config/realtimeTimeoutQueue.js';
import { io, getReceiverSocketId } from '../socket/index.js';
import { processDirectCallTimeout } from '../socket/callHandler.js';
import { processGroupCallRingTimeout } from '../socket/groupCallHandler.js';
import { processMeetingWaitingTimeout } from '../controllers/meetingController.js';

let workerInstance = null;

export function startRealtimeTimeoutWorker() {
    if (workerInstance) return workerInstance;

    workerInstance = new Worker(REALTIME_TIMEOUT_QUEUE_NAME, async (job) => {
        if (job.name === 'direct-call-timeout') {
            await processDirectCallTimeout(io, job.data.sessionId, getReceiverSocketId);
            return;
        }

        if (job.name === 'group-call-ring-timeout') {
            await processGroupCallRingTimeout(io, job.data.conversationId, job.data.callId);
            return;
        }

        if (job.name === 'meeting-waiting-timeout') {
            await processMeetingWaitingTimeout(job.data);
            return;
        }

        console.warn(`[RealtimeTimeoutWorker] Unknown job: ${job.name}`);
    }, {
        connection: redisIOClient,
        concurrency: 10,
    });

    workerInstance.on('error', (err) => {
        if (err.message && !err.message.includes('ECONNREFUSED') && !err.message.includes('ECONNRESET') && !err.message.includes('Connection is closed')) {
            console.error('[RealtimeTimeoutWorker] Error:', err.message);
        }
    });

    return workerInstance;
}
