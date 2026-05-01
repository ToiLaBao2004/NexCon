import User from '../models/userModel.js';
import { upLoadImageFromBuffer, deleteImage } from '../middlewares/uploadMiddleware.js';
import bcrypt from 'bcrypt';
import { searchSpotifyTracks } from '../services/spotifyService.js';

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

export async function searchUsers(req, res) {
    try {
        const { keyword } = req.query;
        const currentUserId = req.user._id;

        if (!keyword || !keyword.trim()) {
            return res.status(200).json({ users: [] });
        }

        const searchEmail = keyword.trim();

        const users = await User.find({
            email: searchEmail
        })
            .select('_id displayName avatarUrl email')
            .limit(20);

        return res.status(200).json({ users });
    } catch (error) {
        console.error('Search users error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
}

export async function updateProfile(req, res) {
    try {
        const userId = req.user._id;
        const { displayName, bio, phone } = req.body;

        // Validation
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

        // Get old avatar info
        const user = await User.findById(userId);
        if (user && user.avatarId) {
            try {
                // Delete from Cloudinary
                await deleteImage(user.avatarId);
            } catch (deleteError) {
                console.error("Lỗi khi xóa ảnh cũ trên Cloudinary:", deleteError);
                // Ignore delete error
            }
        }

        // Upload new avatar
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

export async function searchMusic(req, res) {
    try {
        const { q } = req.query;

        if (!q || !q.trim()) {
            return res.status(400).json({ message: "Missing search query" });
        }

        const tracks = await searchSpotifyTracks(q.trim());

        return res.status(200).json({ tracks });
    } catch (error) {
        console.error("Search music error:", error);
        return res.status(500).json({ message: "Search music failed" });
    }
}

export async function updateMusic(req, res) {
    try {
        const userId = req.user._id;
        const { trackId } = req.body;

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            {
                $set: {
                    music: { trackId }
                }
            },
            { new: true }
        ).select("-password");

        res.json(updatedUser);
    } catch (err) {
        res.status(500).json({ message: "Error" });
    }
}

export async function removeMusic(req, res) {
    try {
        const userId = req.user._id;

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $unset: { music: "" } },
            { new: true }
        ).select("-password");

        return res.status(200).json({
            message: "Music removed successfully",
            user: updatedUser
        });
    } catch (error) {
        console.error("Remove music error:", error);
        return res.status(500).json({ message: "Remove music failed" });
    }
}

export async function changePassword(req, res) {
    try {
        const userId = req.user._id;
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: 'Vui lòng nhập đầy đủ mật khẩu cũ và mới' });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ message: 'Mật khẩu mới phải có ít nhất 8 ký tự' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'Người dùng không tồn tại' });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Mật khẩu hiện tại không chính xác' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        await user.save();

        return res.status(200).json({ message: 'Đổi mật khẩu thành công' });
    } catch (error) {
        console.error('Change password error:', error);
        return res.status(500).json({ message: 'Lỗi máy chủ nội bộ' });
    }
}