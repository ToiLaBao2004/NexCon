import { Queue, QueueEvents } from 'bullmq';
import redisIOClient, { isRedisIOReady } from './redisIOClient.js';

const QUEUE_NAME = 'realtime-timeout';
const QUEUE_OPERATION_TIMEOUT_MS = Number(process.env.REALTIME_QUEUE_OPERATION_TIMEOUT_MS || 1500);
const MEETING_WAITING_JOB_SET_PREFIX = 'nexcon:realtime:meeting-waiting-jobs';

export const REALTIME_TIMEOUT_QUEUE_NAME = QUEUE_NAME;

export const realtimeTimeoutQueue = new Queue(QUEUE_NAME, {
    connection: redisIOClient,
    defaultJobOptions: {
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: 100,
    },
});

export const realtimeTimeoutQueueEvents = new QueueEvents(QUEUE_NAME, {
    connection: redisIOClient,
});

realtimeTimeoutQueue.on('error', (err) => {
    if (err.message && !err.message.includes('ECONNREFUSED') && !err.message.includes('ECONNRESET') && !err.message.includes('Connection is closed')) {
        console.error('[RealtimeTimeoutQueue] Queue error:', err.message);
    }
});

realtimeTimeoutQueueEvents.on('error', (err) => {
    if (err.message && !err.message.includes('ECONNREFUSED') && !err.message.includes('ECONNRESET') && !err.message.includes('Connection is closed')) {
        console.error('[RealtimeTimeoutQueue] QueueEvents error:', err.message);
    }
});

function isQueueReady(action, id = '') {
    if (isRedisIOReady) return true;
    console.warn(`[RealtimeTimeoutQueue] Redis is not ready, skipping ${action}${id ? ` (${id})` : ''}.`);
    return false;
}

function withQueueTimeout(promise, action, id = '') {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(`${action}${id ? ` (${id})` : ''} timed out after ${QUEUE_OPERATION_TIMEOUT_MS}ms`));
        }, QUEUE_OPERATION_TIMEOUT_MS);
    });

    return Promise.race([promise, timeoutPromise])
        .finally(() => clearTimeout(timeoutId));
}

async function addTimeoutJob(name, data, { jobId, delay }) {
    if (!isQueueReady(`schedule ${name}`, jobId)) return null;

    try {
        return await withQueueTimeout(
            realtimeTimeoutQueue.add(name, data, {
                jobId,
                delay: Math.max(Number(delay) || 0, 0),
            }),
            `schedule ${name}`,
            jobId,
        );
    } catch (error) {
        if (error?.message?.includes?.('Job already exists')) return null;
        console.error(`[RealtimeTimeoutQueue] Cannot schedule ${name}:`, error.message);
        return null;
    }
}

async function removeTimeoutJob(jobId) {
    if (!jobId || !isQueueReady('remove timeout job', jobId)) return false;

    try {
        const job = await withQueueTimeout(
            realtimeTimeoutQueue.getJob(jobId),
            'get timeout job',
            jobId,
        );
        if (job) {
            await withQueueTimeout(job.remove(), 'remove timeout job', jobId);
        }
        return true;
    } catch (error) {
        console.warn(`[RealtimeTimeoutQueue] Cannot remove job ${jobId}:`, error.message);
        return false;
    }
}

export function directCallTimeoutJobId(sessionId) {
    return `direct-call-${sessionId}`;
}

export function groupCallRingTimeoutJobId(conversationId, callId) {
    return `group-call-ring-${conversationId}-${callId}`;
}

export function meetingWaitingTimeoutJobId(roomName, userId) {
    return `meeting-waiting-${roomName}-${userId}`;
}

function meetingWaitingJobSetKey(roomName) {
    return `${MEETING_WAITING_JOB_SET_PREFIX}:${roomName}`;
}

export function scheduleDirectCallTimeout(sessionId, delay) {
    return addTimeoutJob('direct-call-timeout', { sessionId }, {
        jobId: directCallTimeoutJobId(sessionId),
        delay,
    });
}

export function removeDirectCallTimeout(sessionId) {
    return removeTimeoutJob(directCallTimeoutJobId(sessionId));
}

export function scheduleGroupCallRingTimeout(conversationId, callId, delay) {
    return addTimeoutJob('group-call-ring-timeout', { conversationId, callId }, {
        jobId: groupCallRingTimeoutJobId(conversationId, callId),
        delay,
    });
}

export function removeGroupCallRingTimeout(conversationId, callId) {
    return removeTimeoutJob(groupCallRingTimeoutJobId(conversationId, callId));
}

export async function scheduleMeetingWaitingTimeout(roomName, userId, meetingId, delay) {
    const jobId = meetingWaitingTimeoutJobId(roomName, userId);
    const job = await addTimeoutJob('meeting-waiting-timeout', { roomName, userId, meetingId }, {
        jobId,
        delay,
    });

    if (job && isRedisIOReady) {
        await redisIOClient.sadd(meetingWaitingJobSetKey(roomName), jobId).catch((error) => {
            console.warn('[RealtimeTimeoutQueue] Cannot index meeting waiting job:', error.message);
        });
    }

    return job;
}

export async function removeMeetingWaitingTimeout(roomName, userId) {
    const jobId = meetingWaitingTimeoutJobId(roomName, userId);
    const removed = await removeTimeoutJob(jobId);
    if (isRedisIOReady) {
        await redisIOClient.srem(meetingWaitingJobSetKey(roomName), jobId).catch(() => {});
    }
    return removed;
}

export async function removeMeetingWaitingTimeoutsForRoom(roomName) {
    if (!roomName || !isQueueReady('remove meeting waiting room jobs', roomName)) return false;

    const setKey = meetingWaitingJobSetKey(roomName);
    try {
        const jobIds = await redisIOClient.smembers(setKey);
        await Promise.all(jobIds.map((jobId) => removeTimeoutJob(jobId)));
        await redisIOClient.del(setKey);
        return true;
    } catch (error) {
        console.warn(`[RealtimeTimeoutQueue] Cannot remove meeting waiting jobs for ${roomName}:`, error.message);
        return false;
    }
}
