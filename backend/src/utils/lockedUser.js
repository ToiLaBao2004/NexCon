export const LOCKED_USER_DISPLAY_NAME = 'Người dùng này đã bị khóa';

export function isLockedUser(user) {
    return Boolean(user?.lock?.isLocked);
}

export function maskLockedUser(user) {
    if (!user || !isLockedUser(user)) return user;

    return {
        ...user,
        displayName: LOCKED_USER_DISPLAY_NAME,
        nickname: '',
        avatarUrl: null,
        bio: '',
        phone: '',
        email: '',
        isLocked: true,
        lock: { isLocked: true },
    };
}

export function maskLockedUserDoc(user) {
    const raw = user?.toObject ? user.toObject() : user;
    return maskLockedUser(raw);
}
