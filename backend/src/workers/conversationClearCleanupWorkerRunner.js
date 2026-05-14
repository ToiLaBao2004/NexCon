import 'dotenv/config';
import { v2 as cloudinary } from 'cloudinary';
import { connectDB } from '../config/db.js';
import {
    reloadPendingConversationClearCleanups,
    startConversationClearCleanupWorker,
} from './conversationClearCleanupWorker.js';

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

connectDB().then(() => {
    console.log('[ConversationClearCleanupWorker] Worker dang chay va cho job cleanup.');
    startConversationClearCleanupWorker();
    reloadPendingConversationClearCleanups();
}).catch((error) => {
    console.error('[ConversationClearCleanupWorker] Khong the khoi dong worker:', error);
    process.exit(1);
});
