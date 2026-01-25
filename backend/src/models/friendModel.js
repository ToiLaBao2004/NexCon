import mongoose from 'mongoose';

const friendSchema = new mongoose.Schema({
    userA: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    userB: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    nicknameA: { // userA's nickname for userB
        type: String,
        trim: true
    },
    nicknameB: { // userB's nickname for userA
        type: String,
        trim: true
    }
}, { timestamps: true });

friendSchema.pre('save', function (next) {
    if (!this.isNew) {
        return next();
    }
    const idA = this.userA;
    const idB = this.userB;
    if (idA.toString() > idB.toString()) {
        this.userA = idB;
        this.userB = idA;
    }
    next();
});

friendSchema.index({ userA: 1, userB: 1 }, { unique: true });
friendSchema.index({ userA: 1 });
friendSchema.index({ userB: 1 });

const FriendModel = mongoose.models.Friend || mongoose.model('Friend', friendSchema);

export default FriendModel;