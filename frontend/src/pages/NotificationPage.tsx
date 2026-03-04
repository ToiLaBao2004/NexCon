import { useEffect } from "react";
import { Bell, Inbox, CheckCheck } from "lucide-react";
import { useNotificationStore } from "@/stores/useNotificationStore";
import NotificationCard from "@/components/notification/NotificationCard";
import { Button } from "@/components/ui/button";

const NotificationPage = () => {
    const { notifications, fetchNotifications, markAllAsRead, loading } = useNotificationStore();

    useEffect(() => {
        fetchNotifications();
    }, [fetchNotifications]);

    return (
        <div className="flex-1 h-full flex flex-col bg-card/20 rounded-2xl shadow-soft border border-border/40 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/40 bg-card/50 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Bell className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-foreground">Thông báo</h1>
                        <p className="text-xs text-muted-foreground">
                            {notifications.filter(n => !n.isRead).length} thông báo mới
                        </p>
                    </div>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs gap-2"
                    onClick={() => markAllAsRead()}
                >
                    <CheckCheck className="h-4 w-4" />
                    Đánh dấu tất cả đã đọc
                </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
                {loading && notifications.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                ) : notifications.length > 0 ? (
                    <div className="flex flex-col gap-1 w-full max-w-3xl">
                        {notifications.map((notification) => (
                            <NotificationCard key={notification._id} notification={notification} />
                        ))}
                    </div>
                ) : (
                    <div className="flex-1 h-full flex flex-col items-center justify-center py-20 px-6">
                        <div className="h-20 w-20 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                            <Inbox className="h-10 w-10 text-muted-foreground/40" />
                        </div>
                        <h3 className="text-base font-semibold text-muted-foreground/70 mb-1">Không có thông báo</h3>
                        <p className="text-sm text-muted-foreground/50 text-center max-w-xs">
                            Các lời mời kết bạn sẽ được hiển thị ở đây.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default NotificationPage;
