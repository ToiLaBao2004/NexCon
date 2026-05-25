import UserStatus, {
    USER_MANUAL_STATUSES,
    USER_STATUS_MODES,
} from '../models/userStatusModel.js';
import Friend from '../models/friendModel.js';
import BlockUser from '../models/blockUserModel.js';

export const DISPLAY_STATUSES = [
    'online',
    'away',
    'busy',
    'do_not_disturb',
    'invisible',
    'offline',
];

const STATUS_LABELS = {
    online: 'Trực tuyến',
    away: 'Vắng mặt',
    busy: 'Bận',
    do_not_disturb: 'Không làm phiền',
    invisible: 'Ẩn trạng thái',
    offline: 'Ngoại tuyến',
};

const DEFAULT_STATUS = {
    manual_status: 'online',
    status_mode: 'auto',
    last_seen_at: null,
};

const STATUS_ALIASES = {
    available: 'online',
    active: 'online',
    idle: 'away',
    brb: 'away',
    dnd: 'do_not_disturb',
    'do-not-disturb': 'do_not_disturb',
    do_not_disturb: 'do_not_disturb',
    offline: 'invisible',
    hidden: 'invisible',
};

function normalizeId(value) {
    if (!value) return '';
    return (value._id || value).toString();
}

function uniqueIds(values = []) {
    return [...new Set(values.map(normalizeId).filter(Boolean))];
}

async function getFriendIdsForUser(userId) {
    const viewerId = normalizeId(userId);
    if (!viewerId) return [];

    const friendships = await Friend.find({
        $or: [
            { userA: viewerId },
            { userB: viewerId },
        ],
    }).select('userA userB').lean();

    return uniqueIds(friendships.map((friendship) => {
        const userA = normalizeId(friendship.userA);
        const userB = normalizeId(friendship.userB);
        return userA === viewerId ? userB : userA;
    }));
}

export function canViewerSeePresence(viewerId, targetUserId, friendIds = []) {
    const viewerIdString = normalizeId(viewerId);
    const targetUserIdString = normalizeId(targetUserId);
    if (!viewerIdString || !targetUserIdString) return false;

    const friendIdSet = new Set(uniqueIds(friendIds));
    return targetUserIdString === viewerIdString || friendIdSet.has(targetUserIdString);
}

function filterPresenceIdsForViewer(userIds = [], viewerId, friendIds = []) {
    return uniqueIds(userIds).filter((userId) => canViewerSeePresence(viewerId, userId, friendIds));
}

export function normalizeStatusMode(value) {
    const mode = String(value || '').trim().toLowerCase();
    if (!USER_STATUS_MODES.includes(mode)) {
        return null;
    }
    return mode;
}

export function normalizeManualStatus(value) {
    const raw = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
    const status = STATUS_ALIASES[raw] || raw;
    if (!USER_MANUAL_STATUSES.includes(status)) {
        return null;
    }
    return status;
}

export function formatRelativeTimeVi(value, now = Date.now()) {
    if (!value) return null;
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return null;

    const diffMs = Math.max(0, now - timestamp);
    const seconds = Math.floor(diffMs / 1000);
    if (seconds < 60) return 'vừa xong';

    const minutes = Math.floor(seconds / 60);
    if (minutes < 5) return 'vài phút trước';
    if (minutes < 60) return `${minutes} phút trước`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} giờ trước`;

    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} ngày trước`;

    const months = Math.floor(days / 30);
    if (months < 12) return `${months} tháng trước`;

    const years = Math.floor(months / 12);
    return `${years} năm trước`;
}

function getDefaultStatusDoc(userId) {
    return {
        ...DEFAULT_STATUS,
        userId,
        createdAt: null,
        updatedAt: null,
    };
}

function serializePresence(doc, {
    socketOnline = false,
    viewerIsSelf = false,
    now = Date.now(),
} = {}) {
    const raw = doc?.toObject?.() || doc || {};
    const userId = normalizeId(raw.userId);
    const statusMode = raw.status_mode || DEFAULT_STATUS.status_mode;
    const manualStatus = raw.manual_status || DEFAULT_STATUS.manual_status;

    let status = statusMode === 'manual'
        ? manualStatus
        : (socketOnline ? 'online' : 'offline');

    const hiddenFromViewer = !viewerIsSelf && status === 'invisible';
    if (hiddenFromViewer) {
        status = 'offline';
    }

    const lastSeenAt = hiddenFromViewer ? null : (raw.last_seen_at || null);
    const isOnline = status === 'online';

    return {
        userId,
        status,
        status_label: STATUS_LABELS[status] || STATUS_LABELS.offline,
        status_mode: statusMode,
        manual_status: manualStatus,
        is_online: isOnline,
        last_seen_at: lastSeenAt ? new Date(lastSeenAt).toISOString() : null,
        last_seen_relative: lastSeenAt ? formatRelativeTimeVi(lastSeenAt, now) : null,
        updatedAt: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : null,
    };
}

export async function ensureUserStatus(userId) {
    return UserStatus.findOneAndUpdate(
        { userId },
        {
            $setOnInsert: {
                userId,
                manual_status: DEFAULT_STATUS.manual_status,
                status_mode: DEFAULT_STATUS.status_mode,
                last_seen_at: new Date(),
            },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );
}

export async function touchUserActivity(userId, at = new Date()) {
    if (!userId) return null;
    return UserStatus.findOneAndUpdate(
        { userId },
        {
            $set: { last_seen_at: at },
            $setOnInsert: {
                manual_status: DEFAULT_STATUS.manual_status,
                status_mode: DEFAULT_STATUS.status_mode,
            },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );
}

export async function updateUserStatus(userId, updates = {}) {
    const $set = {};

    if (Object.prototype.hasOwnProperty.call(updates, 'status_mode')) {
        const mode = normalizeStatusMode(updates.status_mode);
        if (!mode) {
            const error = new Error('status_mode must be auto or manual.');
            error.statusCode = 400;
            throw error;
        }
        $set.status_mode = mode;
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'manual_status')) {
        const manualStatus = normalizeManualStatus(updates.manual_status);
        if (!manualStatus) {
            const error = new Error(`manual_status must be one of: ${USER_MANUAL_STATUSES.join(', ')}.`);
            error.statusCode = 400;
            throw error;
        }
        $set.manual_status = manualStatus;
        if (!Object.prototype.hasOwnProperty.call($set, 'status_mode')) {
            $set.status_mode = 'manual';
        }
    }

    $set.last_seen_at = new Date();
    const $setOnInsert = {
        userId,
        manual_status: DEFAULT_STATUS.manual_status,
        status_mode: DEFAULT_STATUS.status_mode,
    };
    for (const field of Object.keys($set)) {
        delete $setOnInsert[field];
    }

    return UserStatus.findOneAndUpdate(
        { userId },
        {
            $set,
            $setOnInsert,
        },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
}

export async function getSelfPresence(userId, { socketOnline = false } = {}) {
    const doc = await ensureUserStatus(userId);
    return serializePresence(doc, {
        socketOnline,
        viewerIsSelf: true,
    });
}

export async function getVisiblePresencesForUsers(userIds = [], {
    socketOnlineUserIds = [],
    viewerId = null,
    viewerFriendIds = null,
} = {}) {
    const ids = uniqueIds(userIds);
    if (!ids.length) return [];

    const friendIds = Array.isArray(viewerFriendIds)
        ? viewerFriendIds
        : await getFriendIdsForUser(viewerId);
    const visibleIds = filterPresenceIdsForViewer(ids, viewerId, friendIds);
    if (!visibleIds.length) return [];

    const socketOnlineSet = new Set(uniqueIds(socketOnlineUserIds));
    const docs = await UserStatus.find({ userId: { $in: visibleIds } }).lean();
    const docByUserId = new Map(docs.map((doc) => [normalizeId(doc.userId), doc]));
    const now = Date.now();
    const viewerIdString = normalizeId(viewerId);

    return visibleIds.map((userId) => serializePresence(
        docByUserId.get(userId) || getDefaultStatusDoc(userId),
        {
            socketOnline: socketOnlineSet.has(userId),
            viewerIsSelf: viewerIdString === userId,
            now,
        }
    ));
}

async function getRelatedPresenceUserIds(viewerId) {
    const viewerIdString = normalizeId(viewerId);
    const friendIds = await getFriendIdsForUser(viewerIdString);

    return {
        friendIds,
        relatedIds: uniqueIds([viewerIdString, ...friendIds]),
    };
}

export async function buildPresencePayloadForViewer(viewerId, {
    socketOnlineUserIds = [],
    includeUserIds = [],
} = {}) {
    const viewerIdString = normalizeId(viewerId);
    const [{ friendIds, relatedIds }, blocks] = await Promise.all([
        getRelatedPresenceUserIds(viewerId),
        BlockUser.find({
            $or: [
                { from: viewerId },
                { to: viewerId },
            ],
        }).select('from to').lean(),
    ]);

    const blockedIds = new Set(blocks.map((block) => {
        const from = normalizeId(block.from);
        const to = normalizeId(block.to);
        return from === viewerIdString ? to : from;
    }));

    const candidateIds = uniqueIds([...relatedIds, ...includeUserIds]);
    const visibleIds = candidateIds.filter((id) => id === viewerIdString || !blockedIds.has(id));
    const presences = await getVisiblePresencesForUsers(visibleIds, {
        socketOnlineUserIds,
        viewerId,
        viewerFriendIds: friendIds,
    });

    return {
        onlineUserIds: presences.filter((presence) => presence.is_online).map((presence) => presence.userId),
        presences,
        generatedAt: new Date().toISOString(),
    };
}
