import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';

export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
export const MAX_FILE_SIZE = 10 * 1024 * 1024;
const AVATAR_IMAGE_MAX_DIMENSION = 1024;

export const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE },
});

export const handleUploadError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({
                message: `File quá lớn. Kích thước tối đa là ${MAX_FILE_SIZE / 1024 / 1024}MB.`,
            });
        }
        return res.status(400).json({ message: `Upload error: ${err.message}` });
    }
    next(err);
};

export const uploadImageFromBuffer = (buffer, folder = 'NexCon/avatars') => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder,
                resource_type: 'image',
                transformation: [
                    {
                        width: AVATAR_IMAGE_MAX_DIMENSION,
                        height: AVATAR_IMAGE_MAX_DIMENSION,
                        crop: 'limit',
                        quality: 'auto:best',
                    },
                ],
            },
            (error, result) => (error ? reject(error) : resolve(result))
        );
        stream.end(buffer);
    });
};

export const uploadChatImageFromBuffer = (buffer, folder = 'NexCon/messages/images') => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder,
                resource_type: 'image',
                type: 'authenticated',
            },
            (error, result) => (error ? reject(error) : resolve(result))
        );
        stream.end(buffer);
    });
};

export const uploadRawFileFromBuffer = (buffer, originalName, folder = 'NexCon/messages/files') => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder,
                resource_type: 'raw',
                type: 'authenticated',
                public_id: `${Date.now()}_${originalName}`,
                use_filename: false,
            },
            (error, result) => (error ? reject(error) : resolve(result))
        );
        stream.end(buffer);
    });
};

export const uploadAudioFromBuffer = (buffer, originalName, folder = 'NexCon/messages/audio') => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder,
                resource_type: 'raw', // Use raw instead of video to prevent 404 extension issues with authenticated blobs
                type: 'authenticated',
                public_id: `${Date.now()}_${originalName}`,
                use_filename: false,
            },
            (error, result) => (error ? reject(error) : resolve(result))
        );
        stream.end(buffer);
    });
};

export const deleteCloudinaryResource = (publicId, resourceType = 'image', deliveryType = 'upload') => {
    return new Promise((resolve, reject) => {
        cloudinary.uploader.destroy(
            publicId,
            { resource_type: resourceType, type: deliveryType },
            (error, result) => (error ? reject(error) : resolve(result))
        );
    });
};

// Alias cũ
export const upLoadImageFromBuffer = uploadImageFromBuffer;
export const deleteImage = (publicId) => deleteCloudinaryResource(publicId, 'image');
