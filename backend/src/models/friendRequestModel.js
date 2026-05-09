import mongoose from 'mongoose';

const friendRequestSchema = new mongoose.Schema({
    from: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    to: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    message: {
        type: String,
        trim: true,
        maxlength: 300
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected'],
        default: 'pending'
    }
}, { timestamps: true });

friendRequestSchema.index({ from: 1, to: 1 }, { unique: true });
friendRequestSchema.index({ from: 1 });
friendRequestSchema.index({ to: 1 });

// Auto delete friend requests if status is accepted
friendRequestSchema.post('findOneAndUpdate', async function(doc) {
    if (doc && doc.status === 'accepted') {
        await doc.remove();
    }
});

// Auto delete friend requests after 30 days if not accepted
friendRequestSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

const FriendRequestModel = mongoose.models.FriendRequest || mongoose.model('FriendRequest', friendRequestSchema);

export default FriendRequestModel;