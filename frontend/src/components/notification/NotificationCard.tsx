import React from 'react';
import { useNavigate } from 'react-router';
import { useNotificationStore } from '@/stores/useNotificationStore';
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
};

const getFriendlyNotificationTitle = (title?: string) => {
    const normalizedTitle = typeof title === 'string' ? normalizeNotificationTitle(title) : '';
    if (!normalizedTitle) {
        return 'Thông báo hệ thống';
    }

    return FRIENDLY_NOTIFICATION_TITLE_MAP[normalizedTitle] ?? title;
};

const resolveNotificationPath = (notification: Notification) => {
    const normalizedTitle = normalizeNotificationTitle(notification.title || '');

    if (normalizedTitle === 'new friend request' || normalizedTitle === 'friend request resent') {
        return '/people?tab=requests';
    }

    if (normalizedTitle === 'friend request accepted') {
        return '/people?tab=friends';
    }

    return '/people';
};

const NotificationCard: React.FC<NotificationCardProps> = ({ notification }) => {
    const navigate = useNavigate();
    const markAsRead = useNotificationStore((state) => state.markAsRead);
    const pendingReadIds = useNotificationStore((state) => state.pendingReadIds);
    const markAllPending = useNotificationStore((state) => state.markAllPending);
    const isPendingRead = pendingReadIds.includes(notification._id);
    const isUnread = !notification.isRead;
    const isReadOnlyAction = !isUnread || isPendingRead || markAllPending;

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
                            {notification.content}
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
                                {getFriendlyNotificationTitle(notification.title)}
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
