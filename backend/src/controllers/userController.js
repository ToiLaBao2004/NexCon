import User from '../models/userModel.js';
import BlockUser from '../models/blockUserModel.js';
import { MAX_IMAGE_SIZE, upLoadImageFromBuffer, deleteImage } from '../middlewares/uploadMiddleware.js';
import bcrypt from 'bcrypt';
import { searchSpotifyTracks } from '../services/spotifyService.js';
import { checkFieldFormat } from '../utils/fieldFormat.js';
import { maskLockedUser } from '../utils/lockedUser.js';
import { getUserModerationDetails } from '../services/moderation/violationService.js';
import {
    getSelfPresence,
    getVisiblePresencesForUsers,
    updateUserStatus as updateUserStatusPreference,
} from '../services/userStatusService.js';
import { emitOnlineUsers, isUserOnline } from '../socket/index.js';

export async function getCurrentUser(req, res) {
    try {
        const userId = req.user._id || req.user.id;

        const user = await User.findById(userId).select("-password").lean();
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const presence = await getSelfPresence(userId, { socketOnline: isUserOnline(userId) });

        return res.status(200).json({ user: { ...user, presence } });
    } catch (error) {
        console.error("Get current user error:", error);
        return res.status(500).json({ message: "Server error" });
    }
}

export async function getMyUserStatus(req, res) {
    try {
        const userId = req.user._id || req.user.id;
        const presence = await getSelfPresence(userId, { socketOnline: isUserOnline(userId) });

        return res.status(200).json({ presence });
    } catch (error) {
        console.error("Get user status error:", error);
        return res.status(500).json({ message: "Server error" });
    }
}

export async function updateMyUserStatus(req, res) {
    try {
        const userId = req.user._id || req.user.id;
        const requestedStatus = req.body?.status;
        const requestedMode = req.body?.status_mode ?? req.body?.statusMode;
        const requestedManualStatus = req.body?.manual_status ?? req.body?.manualStatus;
        const requestedShowActivity = req.body?.show_activity ?? req.body?.showActivity;

        const updates = {};
        if (requestedMode !== undefined) {
            updates.status_mode = requestedMode;
        }
        if (requestedManualStatus !== undefined) {
            updates.manual_status = requestedManualStatus;
        } else if (requestedStatus !== undefined) {
            if (String(requestedStatus).trim().toLowerCase() === 'auto') {
                updates.status_mode = 'auto';
            } else {
                updates.manual_status = requestedStatus;
            }
        }
        if (requestedShowActivity !== undefined) {
            updates.show_activity = requestedShowActivity;
        }

        await updateUserStatusPreference(userId, updates);
        const presence = await getSelfPresence(userId, { socketOnline: isUserOnline(userId) });
        await emitOnlineUsers();

        return res.status(200).json({ presence });
    } catch (error) {
        console.error("Update user status error:", error);
        return res.status(error.statusCode || 500).json({
            message: error.statusCode ? error.message : "Server error",
        });
    }
}

export async function getMyModerationStatus(req, res) {
    try {
        const limit = Math.max(1, Math.min(100, Number.parseInt(req.query?.limit || '30', 10) || 30));
        const moderation = await getUserModerationDetails(req.user._id, { limit });

        return res.status(200).json(moderation);
    } catch (error) {
        console.error("Get moderation status error:", error);
        return res.status(error.statusCode || 500).json({
            message: error.statusCode === 404 ? "User not found" : "Server error",
        });
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

        const blocks = await BlockUser.find({
            $or: [
                { from: currentUserId },
                { to: currentUserId }
            ]
        }).lean();

        const blockedIds = blocks.map(b => 
            b.from.toString() === currentUserId.toString() ? b.to : b.from
        );

        const users = await User.find({
            email: searchEmail,
            $or: [{ role: 'user' }, { role: { $exists: false } }, { role: null }],
            _id: { $nin: blockedIds }
        })
            .select('_id displayName avatarUrl email lock')
            .limit(20)
            .lean();

        return res.status(200).json({ users: users.map(maskLockedUser) });
    } catch (error) {
        console.error('Search users error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
}

export async function updateProfile(req, res) {
    try {
        const userId = req.user._id;
        const { displayName, bio, phone } = req.body;
        const displayNameError = checkFieldFormat('displayName', displayName);
        const phoneError = checkFieldFormat('phone', phone);

        // Validation
        if (displayNameError || phoneError) {
            return res.status(400).json({ message: displayNameError || phoneError });
        }

        if (bio && bio.length > 150) {
            return res.status(400).json({ message: 'Tiểu sử không được quá 150 ký tự' });
        }

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            {
                $set: {
                    displayName: displayName?.trim(),
                    bio,
                    phone: phone?.trim()
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

        if (!req.file.mimetype?.startsWith('image/')) {
            return res.status(400).json({ message: 'Uploaded file is not an image.' });
        }

        if (req.file.size > MAX_IMAGE_SIZE) {
            return res.status(413).json({
                message: `Ảnh quá lớn. Kích thước tối đa là ${MAX_IMAGE_SIZE / 1024 / 1024}MB.`,
            });
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
            return res.status(200).json({ tracks: [] });
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
        const { currentPassword, newPassword, confirmNewPassword } = req.body;

        if (!currentPassword || !newPassword || !confirmNewPassword) {
            return res.status(400).json({ message: 'Vui lòng nhập đầy đủ mật khẩu cũ và mới' });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ message: 'Mật khẩu mới phải có ít nhất 8 ký tự' });
        }

        if (newPassword !== confirmNewPassword) {
            return res.status(400).json({ message: 'Mật khẩu mới và xác nhận mật khẩu không khớp' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'Người dùng không tồn tại' });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Mật khẩu hiện tại không chính xác' });
        }

        const isSameAsCurrent = await bcrypt.compare(newPassword, user.password);
        if (isSameAsCurrent) {
            return res.status(400).json({ message: 'Mật khẩu mới không được trùng với mật khẩu hiện tại' });
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

export async function getUserById(req, res) {
    try {
        const { id } = req.params;

        const user = await User.findOne({
            _id: id,
            $or: [{ role: 'user' }, { role: { $exists: false } }, { role: null }],
        }).select("-password").lean();
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const currentUserId = req.user?._id?.toString?.();
        if (currentUserId && id !== currentUserId) {
            const blockExists = await BlockUser.findOne({
                $or: [
                    { from: id, to: currentUserId },
                    { from: currentUserId, to: id }
                ]
            });
            if (blockExists) {
                return res.status(404).json({ message: "User not found" });
            }
        }

        const [presence] = await getVisiblePresencesForUsers([id], {
            socketOnlineUserIds: isUserOnline(id) ? [id] : [],
            viewerId: currentUserId,
        });
        const visibleUser = currentUserId && id === currentUserId ? user : maskLockedUser(user);

        return res.status(200).json({
            user: {
                ...visibleUser,
                presence,
            },
        });
    } catch (error) {
        console.error("Get user by ID error:", error);
        return res.status(500).json({ message: "Server error" });
    }
}
