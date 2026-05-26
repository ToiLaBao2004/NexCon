import mongoose from 'mongoose';

export const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_CONNECTION_STRING, {
            maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE) || 30,
            minPoolSize: 0,
            maxIdleTimeMS: 30000,
            serverSelectionTimeoutMS: 5000,
            waitQueueTimeoutMS: 10000,
        });

        console.log('Connected to MongoDB');
    } catch (error) {
        console.log('Error connecting to MongoDB:', error);
        process.exit(1);
    }
};