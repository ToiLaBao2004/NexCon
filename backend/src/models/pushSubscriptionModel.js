import mongoose from 'mongoose';

const pushSubscriptionSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        endpoint: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            maxlength: 2048,
        },
        keys: {
            p256dh: {
                type: String,
                required: true,
                trim: true,
                maxlength: 512,
            },
            auth: {
                type: String,
                required: true,
                trim: true,
                maxlength: 512,
            },
        },
        userAgent: {
            type: String,
            trim: true,
            maxlength: 512,
        },
    },
    { timestamps: true }
);

// Auto delete stale push subscriptions after 90 days
pushSubscriptionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

const PushSubscriptionModel =
    mongoose.models.PushSubscription || mongoose.model('PushSubscription', pushSubscriptionSchema);

export default PushSubscriptionModel;
