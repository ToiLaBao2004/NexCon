import { useEffect, useMemo, useState } from "react";
import { Bell, Inbox, CheckCheck, Loader2 } from "lucide-react";
import { useNotificationStore } from "@/stores/useNotificationStore";
import NotificationCard from "@/components/notification/NotificationCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const NotificationPage = () => {
    const [filter, setFilter] = useState<"all" | "unread">("all");
    const notifications = useNotificationStore((state) => state.notifications);
    const fetchNotifications = useNotificationStore((state) => state.fetchNotifications);
    const markAllAsRead = useNotificationStore((state) => state.markAllAsRead);
    const loading = useNotificationStore((state) => state.loading);
    const unreadCount = useNotificationStore((state) => state.unreadCount);
    const markAllPending = useNotificationStore((state) => state.markAllPending);

    const filteredNotifications = useMemo(() => {
        if (filter === "unread") {
            return notifications.filter((notification) => !notification.isRead);
        }

        return notifications;
    }, [filter, notifications]);

    useEffect(() => {
        void fetchNotifications();
    }, [fetchNotifications]);

    return (
        <div className="flex-1 h-full overflow-hidden rounded-none md:rounded-3xl border-0 md:border border-border/50 bg-white shadow-soft">
            <div className="flex h-full flex-col">
                <div className="border-b border-border/50 px-4 py-4 md:px-6 md:py-5 backdrop-blur-sm">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-blue-500/20">
                                <Bell className="h-5 w-5" />
                            </div>
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <h1 className="text-xl font-bold text-foreground md:text-2xl">Thông báo</h1>
                                </div>

                            </div>
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            className="h-9 rounded-full bg-background/80 px-4"
                            onClick={() => void markAllAsRead()}
                            disabled={markAllPending || unreadCount === 0}
                        >
                            {markAllPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
                            Đánh dấu tất cả đã đọc
                        </Button>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setFilter("all")}
                            className={cn(
                                "rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                                filter === "all"
                                    ? "border-primary/30 bg-primary/10 text-primary"
                                    : "border-border/70 bg-background/70 text-muted-foreground hover:text-foreground"
                            )}
                        >
                            Tất cả ({notifications.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setFilter("unread")}
                            className={cn(
                                "rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                                filter === "unread"
                                    ? "border-primary/30 bg-primary/10 text-primary"
                                    : "border-border/70 bg-background/70 text-muted-foreground hover:text-foreground"
                            )}
                        >
                            Chưa đọc ({unreadCount})
                        </button>
                    </div>
                </div>

                <div className="beautiful-scrollbar flex-1 overflow-y-auto p-4 md:p-6">
                    {loading && notifications.length === 0 ? (
                        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
                            {Array.from({ length: 4 }).map((_, index) => (
                                <div key={index} className="rounded-2xl border border-border/60 bg-card/80 p-4">
                                    <Skeleton className="h-4 w-2/3" />
                                    <Skeleton className="mt-2 h-3 w-full" />
                                    <Skeleton className="mt-3 h-3 w-1/3" />
                                </div>
                            ))}
                        </div>
                    ) : filteredNotifications.length > 0 ? (
                        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
                            {filteredNotifications.map((notification, index) => (
                                <div
                                    key={notification._id}
                                    className="animate-in fade-in-0 slide-in-from-bottom-2"
                                    style={{ animationDelay: `${index * 35}ms` }}
                                >
                                    <NotificationCard notification={notification} />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex h-full flex-col items-center justify-center px-6 py-20 text-center">
                            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl border border-border/70 bg-background/80 shadow-sm">
                                <Inbox className="h-9 w-9 text-muted-foreground/50" />
                            </div>
                            <h3 className="text-base font-semibold text-foreground">
                                {filter === "unread" ? "Không có thông báo chưa đọc" : "Không có thông báo"}
                            </h3>
                            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                                {filter === "unread"
                                    ? "Bạn đã xử lý hết thông báo mới. Mọi thứ đã gọn gàng."
                                    : "Các lời mời kết bạn và cập nhật hệ thống sẽ hiển thị tại đây."}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default NotificationPage;
