import { Queue, QueueEvents } from 'bullmq';
import redisIOClient, { isRedisIOReady } from './redisIOClient.js';

const QUEUE_NAME = 'reminder';
const QUEUE_OPERATION_TIMEOUT_MS = Number(process.env.REMINDER_QUEUE_OPERATION_TIMEOUT_MS || 1500);

function isReminderQueueReady(action, reminderId = '') {
    if (isRedisIOReady) return true;

    const suffix = reminderId ? ` (${reminderId})` : '';
    console.warn(`[ReminderQueue] Redis chưa sẵn sàng, bỏ qua ${action}${suffix}.`);
    return false;
}

function withReminderQueueTimeout(promise, action, reminderId = '') {
    let timeoutId;

    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            const suffix = reminderId ? ` (${reminderId})` : '';
            reject(new Error(`${action}${suffix} timed out after ${QUEUE_OPERATION_TIMEOUT_MS}ms`));
        }, QUEUE_OPERATION_TIMEOUT_MS);
    });

    return Promise.race([promise, timeoutPromise])
        .finally(() => clearTimeout(timeoutId));
}

// Khởi tạo Queue xử lý nhắc hẹn
export const reminderQueue = new Queue(QUEUE_NAME, {
    connection: redisIOClient,
    defaultJobOptions: {
        attempts: 1, // Không tự động retry, lỗi sẽ xử lý thủ công hoặc log lại
        removeOnComplete: true, // Xóa job khỏi Redis sau khi xong để tiết kiệm RAM
        removeOnFail: 100, // Giữ lại 100 job lỗi gần nhất để debug
    },
});

// Lắng nghe sự kiện toàn cục của Queue (nếu cần monitor)
export const reminderQueueEvents = new QueueEvents(QUEUE_NAME, {
    connection: redisIOClient,
});

reminderQueue.on('error', (err) => {
    if (err.message && !err.message.includes('ECONNREFUSED') && !err.message.includes('ECONNRESET') && !err.message.includes('Connection is closed')) {
        console.error('[ReminderQueue] Lỗi Queue:', err.message);
    }
});

reminderQueueEvents.on('error', (err) => {
    if (err.message && !err.message.includes('ECONNREFUSED') && !err.message.includes('ECONNRESET') && !err.message.includes('Connection is closed')) {
        console.error('[ReminderQueue] Lỗi QueueEvents:', err.message);
    }
});

/**
 * Lập lịch Job nhắc hẹn vào BullMQ
 * @param {Object} reminder - Document từ MongoDB
 */
export async function scheduleReminderJob(reminder) {
    if (!reminder?._id) return null;

    const reminderId = reminder._id.toString();

    if (!isReminderQueueReady('schedule reminder job', reminderId)) {
        return null;
    }

    // Bỏ qua nếu nhắc hẹn đã xong hoặc bị hủy
    if (['triggered', 'dismissed'].includes(reminder.status)) {
        return null;
    }

    // Ưu tiên thời gian tạm hoãn (snoozeUntil) nếu có
    const targetTime = (reminder.status === 'snoozed' && reminder.snoozeUntil)
        ? new Date(reminder.snoozeUntil).getTime()
        : new Date(reminder.remindAt).getTime();

    const delay = targetTime - Date.now();

    // Nếu thời gian đã trôi qua thì không lập lịch
    if (delay < 0) return null;

    try {
        const job = await withReminderQueueTimeout(
            reminderQueue.add(
                'trigger',
                { reminderId },
                {
                    jobId: reminderId, // Dùng ID của reminder làm jobId để tránh trùng job (deduplication)
                    delay,
                },
            ),
            'schedule reminder job',
            reminderId,
        );
        return job;
    } catch (error) {
        if (error?.message?.includes?.('Job already exists')) return null;
        console.error(`[ReminderQueue] Lỗi lập lịch ${reminderId}:`, error);
        return null;
    }
}

/**
 * Hủy Job khỏi hàng chờ
 */
export async function removeReminderJob(reminderId) {
    if (!reminderId) return false;
    const jobId = reminderId.toString();

    if (!isReminderQueueReady('remove reminder job', jobId)) {
        return false;
    }

    try {
        const job = await withReminderQueueTimeout(
            reminderQueue.getJob(jobId),
            'get reminder job',
            jobId,
        );
        if (job) {
            await withReminderQueueTimeout(
                job.remove(),
                'remove reminder job',
                jobId,
            );
        }
        return true;
    } catch (error) {
        console.warn(`[ReminderQueue] Không thể xóa job ${jobId}:`, error?.message);
        return false;
    }
}
