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
        index: true,
    },
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        index: true,
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
        index: true,
    },
    snoozeUntil: {
        type: Date,
    },
    snoozeCount: {
        type: Number,
        default: 0,
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
reminderSchema.index({ sharedKey: 1, userId: 1 }, { unique: true, sparse: true });
reminderSchema.index({ conversationId: 1, sharedKey: 1 }, { sparse: true });

const ReminderModel = mongoose.models.Reminder || mongoose.model('Reminder', reminderSchema);

export default ReminderModel;
