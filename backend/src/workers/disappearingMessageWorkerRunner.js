import 'dotenv/config';
import { v2 as cloudinary } from 'cloudinary';
import { connectDB } from '../config/db.js';
import {
    ensureDisappearingMessageExpirySweep,
    startDisappearingMessageWorker,
} from './disappearingMessageWorker.js';

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

connectDB().then(() => {
    console.log('[DisappearingMessageWorker] Worker is running.');
    startDisappearingMessageWorker();
    ensureDisappearingMessageExpirySweep();
}).catch((error) => {
    console.error('[DisappearingMessageWorker] Cannot start worker:', error);
    process.exit(1);
});
