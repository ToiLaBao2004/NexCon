import { Worker } from 'bullmq';
import redisIOClient, { isRedisIOReady } from '../config/redisIOClient.js';
import { scheduleReminderJob } from '../config/reminderQueue.js';
import Reminder from '../models/reminderModel.js';
import Meeting from '../models/meetingModel.js';
import Conversation from '../models/conversationModel.js';
import User from '../models/userModel.js';
import { emitToUser } from '../socket/index.js';
import { sendReminderEmail } from '../utils/sendEmail.js';
import { normalizeReminderSource, resolveReminderContent } from '../utils/reminderHelper.js';
import { createNotification } from '../services/notificationServices.js';
import { sendPushToUser } from '../services/pushNotificationService.js';
import { isMuted } from '../utils/isMuted.js';

// Logic tính thời điểm nhắc hẹn tiếp theo (cho nhắc hẹn lặp lại)
function getNextRemindAt(currentRemindAt, repeatRule) {
    const nextDate = new Date(currentRemindAt);
    if (repeatRule === 'daily') {
        nextDate.setDate(nextDate.getDate() + 1);
    } else if (repeatRule === 'weekly') {
        nextDate.setDate(nextDate.getDate() + 7);
    } else if (repeatRule === 'monthly') {
        const day = nextDate.getDate();
        nextDate.setMonth(nextDate.getMonth() + 1);
        if (nextDate.getDate() !== day) nextDate.setDate(0);
    }
    return nextDate;
}

// Logic gửi thông báo đồng bộ (Socket -> Push -> Email)
async function processReminder(reminder) {
    const now = new Date();
    const isRepeat = reminder.repeatRule !== 'none';

    // Cập nhật trạng thái trong DB trước khi trigger
    const updateOp = isRepeat
        ? {
            $set: {
                remindAt: getNextRemindAt(reminder.remindAt, reminder.repeatRule),
                status: 'pending',
                snoozeCount: 0,
            },
            $unset: { snoozeUntil: 1 },
        }
        : {
            $set: { status: 'triggered', snoozeCount: 0 },
            $unset: { snoozeUntil: 1 },
        };

    const guardQuery = { _id: reminder._id, status: reminder.status };
    const updated = await Reminder.findOneAndUpdate(guardQuery, updateOp, { new: true });
    if (!updated) return;

    // Build payload gửi qua socket/push
    const normalizedReminder = updated.toObject();
    normalizedReminder.content = resolveReminderContent(normalizedReminder);
    normalizedReminder.source = normalizeReminderSource(normalizedReminder.source);

    const reminderPayload = {
        ...normalizedReminder,
        meetingId: updated.meetingId?.toString?.(),
    };

    if (updated.meetingId) {
        const meeting = await Meeting.findById(updated.meetingId).select('roomName status hostId').populate('hostId', 'displayName');
        if (meeting) {
            reminderPayload.meetingRoomName = meeting.roomName;
            reminderPayload.meetingStatus = meeting.status;
        }
    }

    // 1. Gửi qua Socket (Real-time)
    const delivered = emitToUser(updated.userId.toString(), 'reminder-triggered', { reminder: reminderPayload });

    // 2. Kiểm tra Mute (Chỉ gửi Push/In-app nếu không bị tắt thông báo)
    let muted = false;
    if (updated.conversationId) {
        const conv = await Conversation.findOne({ _id: updated.conversationId, 'participants.userId': updated.userId }, { 'participants.$': 1 }).lean();
        const participant = conv?.participants?.[0];
        const isMeeting = !!(reminderPayload.meetingRoomName || updated.type === 'meeting');
        muted = isMuted(participant?.mute, isMeeting ? 'meetings' : 'messages');
    }

    const reminderContent = resolveReminderContent(reminderPayload);
    const reminderUrl = `/reminders?tab=all&focus=${updated._id}`;

    // 3. Gửi Push & In-app (Nếu user offline hoặc không bị muted)
    if (!muted) {
        if (!delivered) {
            await createNotification(updated.userId, 'Nhắc hẹn', `Bạn có nhắc hẹn: "${reminderContent}"`, reminderUrl).catch(console.error);
        }
        await sendPushToUser(updated.userId.toString(), {
            title: 'Nhắc hẹn',
            body: `"${reminderContent}"`,
            url: reminderUrl,
        }).catch(console.error);
    }

    // 4. Gửi Email (Nếu có cấu hình)
    if (reminder.notifyChannels?.includes('email')) {
        const user = await User.findById(updated.userId).select('email');
        if (user?.email) await sendReminderEmail({ to: user.email, reminder: updated }).catch(console.error);
    }

    // Nếu là nhắc hẹn lặp lại, lập lịch cho lần kế tiếp
    if (isRepeat && updated.status === 'pending') await scheduleReminderJob(updated);
}

// Khởi tạo Worker để xử lý Job từ Redis
let workerInstance = null;
export function startReminderWorker() {
    if (workerInstance) return workerInstance;

    workerInstance = new Worker('reminder', async (job) => {
        const { reminderId } = job.data;
        try {
            const reminder = await Reminder.findById(reminderId);
            if (!reminder || ['triggered', 'dismissed'].includes(reminder.status)) return;

            // Kiểm tra nếu job chạy sớm hơn thời gian tạm hoãn (do race condition)
            if (reminder.snoozeUntil && new Date(reminder.snoozeUntil).getTime() > Date.now()) {
                await scheduleReminderJob(reminder);
                return;
            }

            await processReminder(reminder);
        } catch (error) {
            console.error(`[ReminderWorker] Lỗi Job ${reminderId}:`, error);
        }
    }, {
        connection: redisIOClient,
        concurrency: 5, // Xử lý song song tối đa 5 job
    });

    workerInstance.on('error', (err) => {
        if (err.message && !err.message.includes('ECONNREFUSED') && !err.message.includes('Connection is closed')) {
            console.error('[ReminderWorker] Lỗi:', err.message);
        }
    });

    return workerInstance;
}

/**
 * Đẩy lại tất cả nhắc hẹn đang chờ vào Queue khi Server khởi động
 */
export async function reloadPendingReminders() {
    const runReload = async () => {
        try {
            const now = new Date();
            const reminders = await Reminder.find({
                status: { $in: ['pending', 'snoozed'] },
                $or: [{ remindAt: { $gt: now } }, { snoozeUntil: { $gt: now } }],
            }).lean();

            let count = 0;
            for (const rem of reminders) {
                const job = await scheduleReminderJob(rem);
                if (job) count += 1;
            }
            console.log(`[ReminderMigration] Đã reload ${count}/${reminders.length} nhắc hẹn vào Queue.`);
        } catch (error) {
            console.error('[ReminderMigration] Lỗi reload nhắc hẹn:', error);
        }
    };

    if (isRedisIOReady) {
        await runReload();
    } else {
        console.log('[ReminderMigration] Chờ RedisIO sẵn sàng để reload...');
        redisIOClient.once('ready', () => {
            void runReload();
        });
    }
}
