import mongoose from 'mongoose';

const otpSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    otp: {
        type: String,
        required: true,
    },
    type: {
        type: String,
        required: true,
        enum: ['verification', 'reset_password'],
    },
    expiresAt: {
        type: Date,
        required: true,
    },
}, { timestamps: true });

// Auto delete expired OTPs
otpSchema.index({ "expiresAt": 1 }, { expireAfterSeconds: 0 });

const OtpModel = mongoose.models.Otp || mongoose.model('Otp', otpSchema);

export default OtpModel;