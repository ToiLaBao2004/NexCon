import React from 'react';
import { useNavigate } from 'react-router';
import { useNotificationStore } from '@/stores/useNotificationStore';
import { useChatStore } from '@/stores/useChatStore';
import type { Notification } from '@/types/store';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { BellDot, CalendarClock, MessageCircle, ShieldAlert, UserPlus } from 'lucide-react';

const formatTime = (dateString: string) => {
    const date = new Date(dateString).getTime();
    const now = Date.now();
    const diff = Math.max(0, now - date);
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diff < minute) return 'Vừa xong';
    if (diff < hour) return `${Math.floor(diff / minute)} phút`;
    if (diff < day) return `${Math.floor(diff / hour)} giờ`;
    return `${Math.floor(diff / day)} ngày`;
};

interface NotificationCardProps {
    notification: Notification;
}

const normalizeNotificationTitle = (title: string) => title.trim().toLowerCase();

const FRIENDLY_NOTIFICATION_TITLE_MAP: Record<string, string> = {
    'new friend request': 'Lời mời kết bạn mới',
    'friend request resent': 'Lời mời kết bạn được gửi lại',
    'friend request accepted': 'Lời mời kết bạn đã được chấp nhận',
    'new-device-login': 'Đăng nhập thiết bị mới',
};

const getFriendlyNotificationTitle = (title?: string) => {
    const normalizedTitle = typeof title === 'string' ? normalizeNotificationTitle(title) : '';
    if (!normalizedTitle) return 'Thông báo hệ thống';
    if (normalizedTitle === 'nhắc hẹn bị bỏ lỡ' || normalizedTitle === 'nhắc hẹn') return 'Nhắc hẹn';
    return FRIENDLY_NOTIFICATION_TITLE_MAP[normalizedTitle] ?? title;
};

const getFriendlyNotificationContent = (content?: string) => {
    const safeContent = typeof content === 'string' ? content.trim() : '';
    if (!safeContent) return 'Bạn có một thông báo mới';
    return safeContent.replace(/Bạn có một nhắc hẹn bị bỏ lỡ lúc/gi, 'Bạn có một nhắc hẹn lúc');
};

const getMentionActorAndPreview = (content?: string) => {
    const safeContent = typeof content === 'string' ? content.trim() : '';
    if (!safeContent) return { actorName: 'Ai đó', preview: '' };

    const colonIndex = safeContent.indexOf(':');
    if (colonIndex > 0) {
        const actorName = safeContent.slice(0, colonIndex).trim();
        const preview = safeContent.slice(colonIndex + 1).trim();
        return { actorName: actorName || 'Ai đó', preview };
    }

    return { actorName: 'Ai đó', preview: safeContent };
};

const isMentionNotification = (notification: Notification) => {
    if ((notification.type || '').toLowerCase() === 'mention') return true;
    const normalizedTitle = normalizeNotificationTitle(notification.title || '');
    return normalizedTitle.includes('nhắc đến') || normalizedTitle.includes('được nhắc đến');
};

const toInternalAppPath = (rawUrl?: string) => {
    const safeUrl = typeof rawUrl === 'string' ? rawUrl.trim() : '';
    if (!safeUrl) return null;
    if (safeUrl.startsWith('/')) return safeUrl;

    try {
        const parsed = new URL(safeUrl);
        if (parsed.pathname.startsWith('/')) return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
        return null;
    }

    return null;
};

const getQueryParamFromInternalPath = (internalPath: string | null, key: string) => {
    if (!internalPath) return null;

    const queryString = internalPath.includes('?') ? internalPath.split('?')[1] : '';
    if (!queryString) return null;

    const params = new URLSearchParams(queryString);
    const value = params.get(key);
    return value && value.trim() ? value.trim() : null;
};

const getConversationIdFromNotification = (notification: Notification) => {
    const metaConversationId = notification.metadata?.conversationId;
    if (typeof metaConversationId === 'string' && metaConversationId.trim()) {
        return metaConversationId.trim();
    }

    const internalPath = toInternalAppPath(notification.linkUrl);
    return getQueryParamFromInternalPath(internalPath, 'conversationId');
};

const getMessageIdFromNotification = (notification: Notification) => {
    const metaMessageId = notification.metadata?.messageId;
    if (typeof metaMessageId === 'string' && metaMessageId.trim()) {
        return metaMessageId.trim();
    }

    if (typeof notification.targetId === 'string' && notification.targetId.trim()) {
        return notification.targetId.trim();
    }

    const internalPath = toInternalAppPath(notification.linkUrl);
    return getQueryParamFromInternalPath(internalPath, 'messageId');
};

const resolveNotificationPath = (notification: Notification) => {
    const type = (notification.type || '').toLowerCase();
    if (type === 'account-unlock') return '/notification';
    if (type === 'lock-appeal-result' && notification.metadata?.action === 'approve') return '/notification';

    if (isMentionNotification(notification)) {
        const conversationId = getConversationIdFromNotification(notification);
        const messageId = getMessageIdFromNotification(notification);

        if (conversationId && messageId) {
            return `/chat?conversationId=${encodeURIComponent(conversationId)}&messageId=${encodeURIComponent(messageId)}`;
        }
    }

    const internalPath = toInternalAppPath(notification.linkUrl);
    if (internalPath) return internalPath;

    const normalizedTitle = normalizeNotificationTitle(notification.title || '');
    if (normalizedTitle === 'new friend request' || normalizedTitle === 'friend request resent') {
        return '/people?tab=requests';
    }
    if (normalizedTitle === 'friend request accepted') return '/people?tab=friends';
    if (normalizedTitle.includes('nhắc hẹn')) return '/reminders?tab=all';

    return '/notification';
};

const getNotificationIcon = (notification: Notification) => {
    const raw = `${notification.type || ''} ${notification.title || ''}`.toLowerCase();
    if (raw.includes('friend')) return UserPlus;
    if (raw.includes('mention') || raw.includes('message') || raw.includes('nhắc đến')) return MessageCircle;
    if (raw.includes('reminder') || raw.includes('nhắc hẹn')) return CalendarClock;
    if (raw.includes('lock') || raw.includes('device')) return ShieldAlert;
    return BellDot;
};

const getNotificationActor = (notification: Notification) => {
    if (notification.actorId && typeof notification.actorId === 'object') {
        return notification.actorId;
    }

    return null;
};

const getAvatarFallback = (name?: string) => {
    const normalizedName = name?.trim();
    if (!normalizedName) return '?';
    return normalizedName.charAt(0).toUpperCase();
};

const NotificationCard: React.FC<NotificationCardProps> = ({ notification }) => {
    const navigate = useNavigate();
    const conversations = useChatStore((state) => state.conversations);
    const markAsRead = useNotificationStore((state) => state.markAsRead);
    const pendingReadIds = useNotificationStore((state) => state.pendingReadIds);
    const markAllPending = useNotificationStore((state) => state.markAllPending);
    const isPendingRead = pendingReadIds.includes(notification._id);
    const isUnread = !notification.isRead;
    const mentionNotification = isMentionNotification(notification);
    const NotificationIcon = getNotificationIcon(notification);
    const actor = getNotificationActor(notification);

    const mentionGroupName = (() => {
        if (!mentionNotification) return null;

        const conversationId = getConversationIdFromNotification(notification);
        if (!conversationId) return null;

        const conversation = conversations.find((item) => String(item._id) === String(conversationId));
        if (!conversation || conversation.type !== 'group') return null;

        const groupName = conversation.group?.name?.trim();
        return groupName || null;
    })();

    const mainText = (() => {
        if (!mentionNotification) return getFriendlyNotificationContent(notification.content);

        const { actorName, preview } = getMentionActorAndPreview(notification.content);
        const groupContext = mentionGroupName ? ` trong nhóm "${mentionGroupName}"` : '';
        return `${actorName} đã nhắc đến bạn${groupContext}${preview ? `: ${preview}` : ''}`;
    })();

    const secondaryLabel = mentionNotification
        ? (mentionGroupName ? `Nhắc đến bạn · ${mentionGroupName}` : 'Nhắc đến bạn')
        : getFriendlyNotificationTitle(notification.title);

    const handleClick = async () => {
        if (!notification.isRead && !isPendingRead && !markAllPending) {
            await markAsRead(notification._id);
        }

        navigate(resolveNotificationPath(notification));
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            className={cn(
                'group flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                isUnread ? 'hover:bg-primary/10' : 'hover:bg-muted/60'
            )}
        >
            <div className="relative shrink-0">
                {actor ? (
                    <Avatar className="h-14 w-14 bg-muted">
                        <AvatarImage src={actor.avatarUrl || undefined} alt={actor.displayName} />
                        <AvatarFallback className="bg-muted text-base font-semibold text-muted-foreground">
                            {getAvatarFallback(actor.displayName)}
                        </AvatarFallback>
                    </Avatar>
                ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <NotificationIcon className="h-6 w-6" strokeWidth={1.8} />
                    </div>
                )}
                <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-card">
                    <NotificationIcon className="h-3.5 w-3.5" strokeWidth={2.2} />
                </span>
            </div>

            <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-[15px] leading-snug text-foreground/85">
                    {mainText}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] leading-tight">
                    <span className={cn(isUnread ? 'font-semibold text-primary' : 'text-muted-foreground')}>
                        {formatTime(notification.createdAt)}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="truncate text-muted-foreground">{secondaryLabel}</span>
                </div>
            </div>

            {isPendingRead || markAllPending ? (
                <span className="mt-5 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            ) : isUnread ? (
                <span className="mt-6 h-3 w-3 shrink-0 rounded-full bg-primary" aria-label="Chưa đọc" />
            ) : null}
        </button>
    );
};

export default NotificationCard;
