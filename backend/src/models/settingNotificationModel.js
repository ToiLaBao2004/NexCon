import mongoose from 'mongoose';

const settingNotificationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        required: true
    },
    status: {
        type: String,
        enum: ['on', 'off'],
        default: 'on',
        required: true
    }
}, { timestamps: true });

settingNotificationSchema.index({ userId: 1, conversationId: 1 });

const SettingNotificationModel = mongoose.models.SettingNotification || mongoose.model('SettingNotification', settingNotificationSchema);

export default SettingNotificationModel;