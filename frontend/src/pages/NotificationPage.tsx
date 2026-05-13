import { useEffect, useMemo, useState, type UIEvent } from "react";
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
    const fetchMoreNotifications = useNotificationStore((state) => state.fetchMoreNotifications);
    const markAllAsRead = useNotificationStore((state) => state.markAllAsRead);
    const loading = useNotificationStore((state) => state.loading);
    const hasMore = useNotificationStore((state) => state.hasMore);
    const unreadCount = useNotificationStore((state) => state.unreadCount);
    const totalCount = useNotificationStore((state) => state.totalCount);
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

    const handleScroll = (e: UIEvent<HTMLDivElement>) => {
        if (loading || !hasMore) return;
        const t = e.currentTarget;
        if (t.scrollTop + t.clientHeight >= t.scrollHeight * 0.7) {
            void fetchMoreNotifications();
        }
    };

    return (
        <div className="relative flex-1 h-full overflow-hidden rounded-none border-0 bg-background md:rounded-l-none md:rounded-r-2xl md:border-y md:border-r md:border-l-0 md:border-border/50">
            <div className="flex h-full flex-col">
                <div className="relative z-10 border-b border-border/50 bg-card/80 px-4 py-4 backdrop-blur-sm md:px-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0068ff] text-white shadow-sm shadow-[#0068ff]/20">
                                <Bell className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <h1 className="truncate text-xl font-semibold tracking-tight text-foreground md:text-2xl">Thông báo</h1>
                                </div>
                                <p className="text-sm text-muted-foreground">Cập nhật mới và hoạt động cần chú ý</p>
                            </div>
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            className="h-9 rounded-lg border-border/70 bg-background px-3 text-sm font-medium text-foreground hover:bg-muted/60"
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
                            Tất cả ({totalCount})
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

                <div className="beautiful-scrollbar relative z-10 flex-1 overflow-y-auto p-4 md:p-6" onScroll={handleScroll}>
                    {loading && notifications.length === 0 ? (
                        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
                            {Array.from({ length: 4 }).map((_, index) => (
                                <div key={index} className="rounded-2xl border border-border/60 bg-card/85 p-4 backdrop-blur-sm">
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
                            {loading && (
                                <div className="flex justify-center py-3">
                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex h-full flex-col items-center justify-center px-6 py-20 text-center">
                            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl border border-border/70 bg-card/85 shadow-sm backdrop-blur-sm">
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
