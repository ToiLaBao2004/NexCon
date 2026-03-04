import React from 'react';
import { useNavigate } from 'react-router';
import { useNotificationStore } from '@/stores/useNotificationStore';
import type { Notification } from '@/types/store';
const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('vi-VN');
};

import { MoreHorizontal, Check } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

interface NotificationCardProps {
    notification: Notification;
}

const NotificationCard: React.FC<NotificationCardProps> = ({ notification }) => {
    const navigate = useNavigate();
    const markAsRead = useNotificationStore((state) => state.markAsRead);

    const handleClick = async () => {
        if (!notification.isRead) {
            await markAsRead(notification._id);
        }

        // Chuyển đến tab tương ứng dựa trên tiêu đề thông báo
        const title = notification.title;
        if (title === 'New Friend Request' || title === 'Friend Request Resent') {
            navigate('/people?tab=requests');
        } else if (title === 'Friend Request Accepted') {
            navigate('/people?tab=friends');
        } else {
            navigate('/people');
        }
    };

    const handleMarkAsRead = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!notification.isRead) {
            await markAsRead(notification._id);
        }
    };

    return (
        <div
            onClick={handleClick}
            className={`p-4 pr-20 cursor-pointer border rounded-lg transition-colors group relative ${notification.isRead ? 'bg-card' : 'bg-primary/5 border-primary/20'
                } hover:bg-accent w-full flex justify-between items-center gap-4`}
        >
            <div className="flex-1 min-w-0">
                <p className={`text-sm break-words ${notification.isRead ? 'text-muted-foreground' : 'text-foreground font-bold'}`}>
                    {notification.content}
                </p>
            </div>

            <div
                className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-end w-32"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="relative w-full h-8 flex items-center justify-end">
                    <span className="text-[10px] text-muted-foreground group-hover:opacity-0 transition-opacity whitespace-nowrap absolute right-0 pr-2">
                        {formatTime(notification.createdAt)}
                    </span>

                    <div className="opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity absolute right-0">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-full hover:bg-background/50 focus-visible:ring-0"
                                >
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40 z-[100]">
                                <DropdownMenuItem
                                    onClick={handleMarkAsRead}
                                    disabled={notification.isRead}
                                    className="cursor-pointer gap-2 text-xs"
                                >
                                    <Check className="h-3.5 w-3.5" />
                                    Đánh dấu đã đọc
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NotificationCard;
