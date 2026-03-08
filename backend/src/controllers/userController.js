import User from '../models/userModel.js';
import { upLoadImageFromBuffer, deleteImage } from '../middlewares/uploadMiddleware.js';

export async function getCurrentUser(req, res) {
    try {
        const userId = req.user._id || req.user.id;

        const user = await User.findById(userId).select("-password");
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        return res.status(200).json({ user });
    } catch (error) {
        console.error("Get current user error:", error);
        return res.status(500).json({ message: "Server error" });
    }
}

export async function searchUserByEmailAndPhone(socket, { query }) {
    if (!query || !query.trim()) {
        socket.emit('search-user-result', { user: null, status: 'empty' });
        return;
    }

    try {
        const isEmail = query.includes('@');
        const searchQuery = isEmail ? { email: query.trim() } : { phone: query.trim() };

        const foundUser = await User.findOne(searchQuery).select('_id displayName email avatarUrl bio phone');

        if (foundUser) {
            socket.emit('search-user-result', { user: foundUser, status: 'found' });
        } else {
            socket.emit('search-user-result', { user: null, status: 'not-found' });
        }
    } catch (error) {
        console.error('Search user by email/phone error:', error);
        socket.emit('search-user-result', { user: null, status: 'error' });
    }
}

export async function updateProfile(req, res) {
    try {
        const userId = req.user._id;
        const { displayName, bio, phone } = req.body;

        // Backend Validation
        if (bio && bio.length > 150) {
            return res.status(400).json({ message: 'Tiểu sử không được quá 150 ký tự' });
        }

        if (phone && !/^\d*$/.test(phone)) {
            return res.status(400).json({ message: 'Số điện thoại chỉ được chứa chữ số' });
        }

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            {
                $set: {
                    displayName,
                    bio,
                    phone
                }
            },
            { new: true, runValidators: true }
        ).select('-password');

        if (!updatedUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        return res.status(200).json({
            message: 'Profile updated successfully',
            user: updatedUser
        });
    } catch (error) {
        console.error('Update profile error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
}

export async function updateAvatar(req, res) {
    try {
        const userId = req.user._id;

        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        // Tìm user hiện tại để lấy avatarId cũ
        const user = await User.findById(userId);
        if (user && user.avatarId) {
            try {
                // Xóa ảnh cũ trên Cloudinary
                await deleteImage(user.avatarId);
            } catch (deleteError) {
                console.error("Lỗi khi xóa ảnh cũ trên Cloudinary:", deleteError);
                // Vẫn tiếp tục upload ảnh mới kể cả khi xóa ảnh cũ gặp lỗi
            }
        }

        // Upload ảnh mới lên Cloudinary
        const result = await upLoadImageFromBuffer(req.file.buffer, "NexCon/avatars");

        const avatarUrl = result.secure_url;
        const avatarId = result.public_id;

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            {
                $set: {
                    avatarUrl,
                    avatarId
                }
            },
            { new: true }
        ).select('-password');

        if (!updatedUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        return res.status(200).json({
            message: 'Avatar updated successfully',
            user: updatedUser
        });
    } catch (error) {
        console.error('Update avatar error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
}