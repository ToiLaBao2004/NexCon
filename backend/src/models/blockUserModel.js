import mongoose from "mongoose";

const blockUserSchema = new mongoose.Schema({
    from: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    to: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, { timestamps: true });

blockUserSchema.index({ from: 1, to: 1 });

const BlockUserModel = mongoose.models.BlockUser || mongoose.model('BlockUser', blockUserSchema);

export default BlockUserModel;