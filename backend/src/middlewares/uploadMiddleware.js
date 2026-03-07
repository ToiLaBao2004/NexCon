import multer from "multer";
import { v2 as cloudinary } from 'cloudinary';

export const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 1024 * 1024 * 2, // 2MB
    },
});

export const upLoadImageFromBuffer = (buffer, folder = "NexCon/avatars") => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: folder,
                resource_type: "image",
                transformation: [{ width: 200, height: 200, crop: "fill" }],
            },
            (error, result) => {
                if (error) reject(error);
                else resolve(result);
            }
        );
        uploadStream.end(buffer);
    });
};

export const deleteImage = (publicId) => {
    return new Promise((resolve, reject) => {
        cloudinary.uploader.destroy(publicId, (error, result) => {
            if (error) reject(error);
            else resolve(result);
        });
    });
};
