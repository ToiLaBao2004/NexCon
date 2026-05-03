import { Queue, QueueEvents } from 'bullmq';
import redisIOClient from './redisIOClient.js';

const QUEUE_NAME = 'reminder';

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
    if (err.message && !err.message.includes('ECONNREFUSED') && !err.message.includes('Connection is closed')) {
        console.error('[ReminderQueue] Lỗi Queue:', err.message);
    }
});

reminderQueueEvents.on('error', (err) => {
    if (err.message && !err.message.includes('ECONNREFUSED') && !err.message.includes('Connection is closed')) {
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
        const job = await reminderQueue.add(
            'trigger',
            { reminderId },
            {
                jobId: reminderId, // Dùng ID của reminder làm jobId để tránh trùng job (deduplication)
                delay,
            },
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
    if (!reminderId) return;
    const jobId = reminderId.toString();

    try {
        const job = await reminderQueue.getJob(jobId);
        if (job) await job.remove();
    } catch (error) {
        console.warn(`[ReminderQueue] Không thể xóa job ${jobId}:`, error?.message);
    }
}
