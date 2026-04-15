import cron from 'node-cron';
import Reminder from '../models/reminderModel.js';
import User from '../models/userModel.js';
import { emitToUser } from '../socket/index.js';
import { sendReminderEmail } from './sendEmail.js';
import { normalizeReminderSource, resolveReminderContent } from './reminderHelper.js';
import { createNotification } from '../services/notificationServices.js';
import { sendPushToUser } from '../services/pushNotificationService.js';

function getNextRemindAt(currentRemindAt, repeatRule) {
    const nextDate = new Date(currentRemindAt);

    if (repeatRule === 'daily') {
        nextDate.setDate(nextDate.getDate() + 1);
        return nextDate;
    }

    if (repeatRule === 'weekly') {
        nextDate.setDate(nextDate.getDate() + 7);
        return nextDate;
    }

    if (repeatRule === 'monthly') {
        const day = nextDate.getDate();
        nextDate.setMonth(nextDate.getMonth() + 1);
        if (nextDate.getDate() !== day) {
            nextDate.setDate(0); // lùi về ngày cuối tháng đó
        }
        return nextDate;
    }

    return currentRemindAt;
}

function buildDueReminderQuery(now) {
    return {
        $or: [
            { status: 'pending', remindAt: { $lte: now } },
            {
                status: 'snoozed',
                $or: [
                    { snoozeUntil: { $lte: now } },
                    { snoozeUntil: { $exists: false }, remindAt: { $lte: now } },
                    { snoozeUntil: null, remindAt: { $lte: now } },
                ],
            },
        ],
    };
}

async function processReminder(reminder, now) {
    const isRepeat = reminder.repeatRule !== 'none';

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
            $set: {
                status: 'triggered',
                snoozeCount: 0,
            },
            $unset: { snoozeUntil: 1 },
        };

    const guardQuery = reminder.status === 'pending'
        ? { _id: reminder._id, status: 'pending', remindAt: { $lte: now } }
        : {
            _id: reminder._id,
            status: 'snoozed',
            $or: [
                { snoozeUntil: { $lte: now } },
                { snoozeUntil: { $exists: false }, remindAt: { $lte: now } },
                { snoozeUntil: null, remindAt: { $lte: now } },
            ],
        };

    const updated = await Reminder.findOneAndUpdate(guardQuery, updateOp, { new: true });
    if (!updated) {
        return;
    }

    const normalizedReminder = updated.toObject();
    normalizedReminder.content = resolveReminderContent(normalizedReminder);
    normalizedReminder.source = normalizeReminderSource(normalizedReminder.source);

    const delivered = emitToUser(updated.userId.toString(), 'reminder-triggered', { reminder: normalizedReminder });

    if (!delivered) {
        const offsetMs = 7 * 60 * 60 * 1000;
        const localDate = new Date(updated.remindAt.getTime() + offsetMs);
        const HH = String(localDate.getUTCHours()).padStart(2, '0');
        const mm = String(localDate.getUTCMinutes()).padStart(2, '0');
        const DD = String(localDate.getUTCDate()).padStart(2, '0');
        const MM = String(localDate.getUTCMonth() + 1).padStart(2, '0');
        const YYYY = localDate.getUTCFullYear();
        const formattedTime = `${HH}:${mm} ${DD}/${MM}/${YYYY}`;
        const reminderContent = resolveReminderContent(normalizedReminder);
        const reminderUrl = `/reminders?tab=all&focus=${encodeURIComponent(updated._id.toString())}`;

        try {
            await createNotification(
                updated.userId,
                'Nhắc hẹn',
                `Bạn có một nhắc hẹn lúc ${formattedTime}: "${reminderContent}"`,
                reminderUrl
            );
        } catch (error) {
            console.error(`Reminder cron in-app notification failed (${updated._id}):`, error);
        }

        try {
            await sendPushToUser(updated.userId.toString(), {
                title: 'Nhắc hẹn',
                body: `Lúc ${formattedTime}: "${reminderContent}"`,
                url: reminderUrl,
            });
        } catch (error) {
            console.error(`Reminder cron push notification failed (${updated._id}):`, error);
        }
    }

    if (Array.isArray(reminder.notifyChannels) && reminder.notifyChannels.includes('email')) {
        try {
            const user = await User.findById(updated.userId).select('email');
            if (user?.email) {
                await sendReminderEmail({ to: user.email, reminder: updated });
            }
        } catch (error) {
            console.error(`Reminder cron email failed (${updated._id}):`, error);
        }
    }
}

export function startReminderCron() {
    cron.schedule('*/30 * * * * *', async () => {
        const now = new Date();

        try {
            const reminders = await Reminder.find(buildDueReminderQuery(now))
                .select('userId content title note remindAt repeatRule status snoozeUntil notifyChannels source');

            for (const reminder of reminders) {
                try {
                    await processReminder(reminder, now);
                } catch (error) {
                    console.error(`Reminder cron item failed (${reminder._id}):`, error);
                }
            }
        } catch (error) {
            console.error('Reminder cron batch failed:', error);
        }
    });
}
