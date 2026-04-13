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
        },
        keys: {
            p256dh: {
                type: String,
                required: true,
                trim: true,
            },
            auth: {
                type: String,
                required: true,
                trim: true,
            },
        },
        userAgent: {
            type: String,
            trim: true,
        },
    },
    { timestamps: true }
);

pushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });
pushSubscriptionSchema.index({ userId: 1 });

const PushSubscriptionModel =
    mongoose.models.PushSubscription || mongoose.model('PushSubscription', pushSubscriptionSchema);

export default PushSubscriptionModel;
