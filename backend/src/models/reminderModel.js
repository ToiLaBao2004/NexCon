import mongoose from 'mongoose';
import {
    REMINDER_REPEAT_RULES,
    REMINDER_STATUSES,
    REMINDER_SCOPES,
    REMINDER_PARTICIPATION_STATUSES,
    REMINDER_SOURCE_TYPES,
    REMINDER_NOTIFY_CHANNELS,
} from '../utils/reminderHelper.js';

const reminderSourceSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: REMINDER_SOURCE_TYPES,
    },
    refId: {
        type: String,
        trim: true,
        maxlength: 128,
    },
}, { _id: false });

const reminderSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    scope: {
        type: String,
        enum: REMINDER_SCOPES,
        default: 'personal',
        index: true,
    },
    sharedKey: {
        type: String,
        trim: true,
        maxlength: 128,
        set: (value) => {
            if (value === null || value === undefined) return undefined;
            const normalized = String(value).trim();
            return normalized || undefined;
        },
        index: true,
    },
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        index: true,
    },
    meetingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Meeting',
        index: true,
    },
    meetingRoomName: {
        type: String,
        trim: true,
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true,
    },
    participationStatus: {
        type: String,
        enum: REMINDER_PARTICIPATION_STATUSES,
        default: 'joined',
        index: true,
    },
    content: {
        type: String,
        required: true,
        trim: true,
        maxlength: 1200,
    },
    // Legacy fields kept to avoid breaking existing records during migration.
    title: {
        type: String,
        trim: true,
        maxlength: 200,
    },
    note: {
        type: String,
        trim: true,
        maxlength: 1000,
    },
    remindAt: {
        type: Date,
        required: true,
    },
    snoozeUntil: {
        type: Date,
    },
    snoozeCount: {
        type: Number,
        min: 0,
    },
    repeatRule: {
        type: String,
        enum: REMINDER_REPEAT_RULES,
        default: 'none',
    },
    status: {
        type: String,
        enum: REMINDER_STATUSES,
        default: 'pending',
        index: true,
    },
    dismissedAt: {
        type: Date,
    },
    source: reminderSourceSchema,
    notifyChannels: {
        type: [{
            type: String,
            enum: REMINDER_NOTIFY_CHANNELS,
        }],
        default: ['inapp'],
        validate: {
            validator: (channels) => Array.isArray(channels) && channels.length > 0,
            message: 'At least one notify channel is required.',
        },
    },
}, { timestamps: true });

reminderSchema.pre('validate', function syncLegacyContent(next) {
    if (!this.content || !String(this.content).trim()) {
        const fallback = [this.title, this.note]
            .filter((item) => typeof item === 'string' && item.trim())
            .map((item) => item.trim())
            .join('\n')
            .trim();

        if (fallback) {
            this.content = fallback;
        }
    }

    if (this.source?.type === 'call') {
        this.source.type = 'meeting';
    }

    next();
});

reminderSchema.index({ userId: 1, remindAt: 1, status: 1 });
reminderSchema.index({ createdBy: 1, status: 1 });
reminderSchema.index({ conversationId: 1, status: 1, sharedKey: 1 });
reminderSchema.index(
    { sharedKey: 1, userId: 1 },
    {
        unique: true,
        partialFilterExpression: {
            scope: 'shared',
            sharedKey: { $exists: true, $type: 'string' },
        },
    }
);
reminderSchema.index(
    { conversationId: 1, sharedKey: 1 },
    {
        partialFilterExpression: {
            scope: 'shared',
            sharedKey: { $exists: true, $type: 'string' },
        },
    }
);

// Auto delete personal triggered reminders after 30 days
reminderSchema.index(
    { updatedAt: 1 },
    {
        expireAfterSeconds: 2592000, // 30 days
        partialFilterExpression: { status: 'triggered', scope: 'personal' },
    }
);

// Auto delete personal dismissed reminders after 30 days
reminderSchema.index(
    { dismissedAt: 1 },
    {
        name: 'personal_dismissed_reminder_ttl',
        expireAfterSeconds: 2592000, // 30 days
        partialFilterExpression: { status: 'dismissed', scope: 'personal' },
    }
);

// Auto delete shared reminders 30 days after the scheduled remind time
reminderSchema.index(
    { remindAt: 1 },
    {
        expireAfterSeconds: 2592000, // 30 days
        partialFilterExpression: { scope: 'shared' },
    }
);

const ReminderModel = mongoose.models.Reminder || mongoose.model('Reminder', reminderSchema);

export default ReminderModel;
