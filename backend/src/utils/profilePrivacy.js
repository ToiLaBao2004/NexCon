import Friend from '../models/friendModel.js';

export const PROFILE_VISIBILITY = Object.freeze({
    PUBLIC: 'public',
    FRIENDS: 'friends',
    PRIVATE: 'private',
});

const VALID_PROFILE_VISIBILITIES = new Set(Object.values(PROFILE_VISIBILITY));

export function normalizeProfileVisibility(value) {
    return VALID_PROFILE_VISIBILITIES.has(value) ? value : PROFILE_VISIBILITY.PUBLIC;
}

export function canViewProfileDetails(user, { viewerId, isFriend = false } = {}) {
    const ownerId = (user?._id || user)?.toString?.();
    const viewer = viewerId?.toString?.();

    if (!ownerId || !viewer) return false;
    if (ownerId === viewer) return true;

    const visibility = normalizeProfileVisibility(user?.profileVisibility);
    if (visibility === PROFILE_VISIBILITY.PUBLIC) return true;
    if (visibility === PROFILE_VISIBILITY.FRIENDS) return Boolean(isFriend);
    return false;
}

export function applyProfileVisibility(user, options = {}) {
    if (!user) return user;

    const raw = user?.toObject ? user.toObject() : user;
    const profileVisibility = normalizeProfileVisibility(raw.profileVisibility);
    const profileVisibleToViewer = canViewProfileDetails(
        { ...raw, profileVisibility },
        options
    );

    if (profileVisibleToViewer) {
        return {
            ...raw,
            profileVisibility,
            profileVisibleToViewer,
        };
    }

    return {
        ...raw,
        email: '',
        phone: '',
        bio: '',
        music: undefined,
        profileVisibility,
        profileVisibleToViewer,
    };
}

export async function areFriends(userId, otherUserId) {
    const left = userId?.toString?.();
    const right = otherUserId?.toString?.();

    if (!left || !right || left === right) return false;

    return Boolean(await Friend.exists({
        $or: [
            { userA: left, userB: right },
            { userA: right, userB: left },
        ],
    }));
}
