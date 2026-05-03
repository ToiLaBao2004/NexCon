import React from 'react';
import { useNavigate } from 'react-router';
import { useNotificationStore } from '@/stores/useNotificationStore';
import { useChatStore } from '@/stores/useChatStore';
import type { Notification } from '@/types/store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Check, Loader2, BellDot } from 'lucide-react';

const formatTime = (dateString: string) => {
    const date = new Date(dateString).getTime();
    const now = Date.now();
    const diff = Math.max(0, now - date);
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diff < minute) {
        return 'Vừa xong';
    }

    if (diff < hour) {
        return `${Math.floor(diff / minute)} phút trước`;
    }

    if (diff < day) {
        return `${Math.floor(diff / hour)} giờ trước`;
    }

    return new Date(dateString).toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
};

interface NotificationCardProps {
    notification: Notification;
}

const normalizeNotificationTitle = (title: string) => title.trim().toLowerCase();

const FRIENDLY_NOTIFICATION_TITLE_MAP: Record<string, string> = {
    'new friend request': 'Lời mời kết bạn mới',
    'friend request resent': 'Lời mời kết bạn được gửi lại',
    'friend request accepted': 'Lời mời kết bạn đã được chấp nhận',
    'new-device-login': '⚠️ Đăng nhập thiết bị mới',
};

const getFriendlyNotificationTitle = (title?: string) => {
    const normalizedTitle = typeof title === 'string' ? normalizeNotificationTitle(title) : '';
    if (!normalizedTitle) {
        return 'Thông báo hệ thống';
    }

    if (normalizedTitle === 'nhắc hẹn bị bỏ lỡ' || normalizedTitle === 'nhắc hẹn') {
        return 'Nhắc hẹn';
    }

    return FRIENDLY_NOTIFICATION_TITLE_MAP[normalizedTitle] ?? title;
};

const getFriendlyNotificationContent = (content?: string) => {
    const safeContent = typeof content === 'string' ? content.trim() : '';
    if (!safeContent) {
        return 'Bạn có một thông báo mới';
    }

    return safeContent.replace(/Bạn có một nhắc hẹn bị bỏ lỡ lúc/gi, 'Bạn có một nhắc hẹn lúc');
};

const getMentionActorAndPreview = (content?: string) => {
    const safeContent = typeof content === 'string' ? content.trim() : '';
    if (!safeContent) {
        return { actorName: 'Ai đó', preview: '' };
    }

    const colonIndex = safeContent.indexOf(':');
    if (colonIndex > 0) {
        const actorName = safeContent.slice(0, colonIndex).trim();
        const preview = safeContent.slice(colonIndex + 1).trim();
        return {
            actorName: actorName || 'Ai đó',
            preview,
        };
    }

    return {
        actorName: 'Ai đó',
        preview: safeContent,
    };
};

const isMentionNotification = (notification: Notification) => {
    if ((notification.type || '').toLowerCase() === 'mention') {
        return true;
    }

    const normalizedTitle = normalizeNotificationTitle(notification.title || '');
    return normalizedTitle.includes('nhắc đến') || normalizedTitle.includes('được nhắc đến');
};

const toInternalAppPath = (rawUrl?: string) => {
    const safeUrl = typeof rawUrl === 'string' ? rawUrl.trim() : '';
    if (!safeUrl) {
        return null;
    }

    if (safeUrl.startsWith('/')) {
        return safeUrl;
    }

    try {
        const parsed = new URL(safeUrl);
        if (parsed.pathname.startsWith('/')) {
            return `${parsed.pathname}${parsed.search}${parsed.hash}`;
        }
    } catch {
        return null;
    }

    return null;
};

const getConversationIdFromNotification = (notification: Notification) => {
    const metaConversationId = notification.metadata?.conversationId;
    if (typeof metaConversationId === 'string' && metaConversationId.trim()) {
        return metaConversationId.trim();
    }

    const internalPath = toInternalAppPath(notification.linkUrl);
    if (!internalPath) {
        return null;
    }

    const queryString = internalPath.includes('?') ? internalPath.split('?')[1] : '';
    if (!queryString) {
        return null;
    }

    const params = new URLSearchParams(queryString);
    const conversationId = params.get('conversationId');
    return conversationId && conversationId.trim() ? conversationId.trim() : null;
};

const resolveNotificationPath = (notification: Notification) => {
    const internalPath = toInternalAppPath(notification.linkUrl);
    if (internalPath) {
        return internalPath;
    }

    const normalizedTitle = normalizeNotificationTitle(notification.title || '');

    if (normalizedTitle === 'new friend request' || normalizedTitle === 'friend request resent') {
        return '/people?tab=requests';
    }

    if (normalizedTitle === 'friend request accepted') {
        return '/people?tab=friends';
    }

    if (normalizedTitle.includes('nhắc hẹn')) {
        return '/reminders?tab=all';
    }

    return '/notification';
};

const NotificationCard: React.FC<NotificationCardProps> = ({ notification }) => {
    const navigate = useNavigate();
    const conversations = useChatStore((state) => state.conversations);
    const markAsRead = useNotificationStore((state) => state.markAsRead);
    const pendingReadIds = useNotificationStore((state) => state.pendingReadIds);
    const markAllPending = useNotificationStore((state) => state.markAllPending);
    const isPendingRead = pendingReadIds.includes(notification._id);
    const isUnread = !notification.isRead;
    const isReadOnlyAction = !isUnread || isPendingRead || markAllPending;
    const mentionNotification = isMentionNotification(notification);

    const mentionGroupName = (() => {
        if (!mentionNotification) {
            return null;
        }

        const conversationId = getConversationIdFromNotification(notification);
        if (!conversationId) {
            return null;
        }

        const conversation = conversations.find((item) => String(item._id) === String(conversationId));
        if (!conversation || conversation.type !== 'group') {
            return null;
        }

        const groupName = conversation.group?.name?.trim();
        return groupName || null;
    })();

    const mentionText = (() => {
        if (!mentionNotification) {
            return getFriendlyNotificationContent(notification.content);
        }

        const { actorName, preview } = getMentionActorAndPreview(notification.content);
        const groupContext = mentionGroupName ? ` trong nhóm "${mentionGroupName}"` : '';
        return `${actorName} đã nhắc đến bạn${groupContext}${preview ? `: ${preview}` : ''}`;
    })();

    const secondaryLabel = mentionNotification
        ? (mentionGroupName ? `Nhắc đến bạn - ${mentionGroupName}` : 'Nhắc đến bạn')
        : getFriendlyNotificationTitle(notification.title);

    const handleClick = async () => {
        if (!notification.isRead && !isPendingRead && !markAllPending) {
            await markAsRead(notification._id);
        }

        navigate(resolveNotificationPath(notification));
    };

    const handleMarkAsRead = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isReadOnlyAction) {
            await markAsRead(notification._id);
        }
    };

    return (
        <div
            onClick={handleClick}
            className={cn(
                'group w-full cursor-pointer rounded-2xl border p-4 transition-all duration-200',
                'hover:-translate-y-0.5 hover:shadow-md',
                notification.isRead
                    ? 'border-border/70 bg-card/80 hover:bg-card'
                    : 'border-primary/20 bg-gradient-to-r from-primary/10 via-cyan-400/5 to-transparent shadow-[0_0_0_1px_hsl(var(--primary)/0.05)]'
            )}
        >
            <div className="flex min-w-0 items-start gap-3">
                <div
                    className={cn(
                        'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border',
                        notification.isRead
                            ? 'border-border/70 bg-muted/60 text-muted-foreground'
                            : 'border-primary/20 bg-primary/10 text-primary'
                    )}
                >
                    <BellDot className="h-4 w-4" />
                </div>

                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className={cn('text-sm break-words', notification.isRead ? 'text-foreground/80' : 'font-semibold text-foreground')}>
                            {mentionText}
                        </p>
                        {isUnread && (
                            <Badge
                                variant="secondary"
                                className="rounded-full border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary"
                            >
                                Mới
                            </Badge>
                        )}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                            <p className="truncate text-[11px] tracking-wide text-muted-foreground/80">
                                {secondaryLabel}
                            </p>
                            <span className="text-[11px] text-muted-foreground">{formatTime(notification.createdAt)}</span>
                        </div>

                        {isUnread && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 rounded-full px-3 text-xs"
                                onClick={handleMarkAsRead}
                                disabled={isReadOnlyAction}
                            >
                                {isPendingRead ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                Đánh dấu đã đọc
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NotificationCard;
