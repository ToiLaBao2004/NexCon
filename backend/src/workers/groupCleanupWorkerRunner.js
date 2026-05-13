import 'dotenv/config';
import { v2 as cloudinary } from 'cloudinary';
import { connectDB } from '../config/db.js';
import { startGroupCleanupWorker } from './groupCleanupWorker.js';

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

connectDB().then(() => {
    startGroupCleanupWorker();
    console.log('[GroupCleanupWorker] Worker dang chay va cho job cleanup.');
}).catch((error) => {
    console.error('[GroupCleanupWorker] Khong the khoi dong worker:', error);
    process.exit(1);
});
