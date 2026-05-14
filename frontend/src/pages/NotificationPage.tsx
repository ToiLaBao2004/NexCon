import { useEffect, useMemo, useState, type UIEvent } from "react";
import { CheckCheck, Inbox, Loader2, MoreHorizontal } from "lucide-react";
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

    const handleScroll = (event: UIEvent<HTMLDivElement>) => {
        if (loading || !hasMore) return;
        const target = event.currentTarget;
        if (target.scrollTop + target.clientHeight >= target.scrollHeight * 0.7) {
            void fetchMoreNotifications();
        }
    };

    return (
        <div className="relative h-full flex-1 overflow-hidden rounded-none border-0 bg-background md:rounded-l-none md:rounded-r-2xl md:border-y md:border-r md:border-l-0 md:border-border/50">
            <div className="flex h-full justify-center overflow-hidden px-3 py-4 md:px-6">
                <section className="flex h-full w-full max-w-[850px] min-h-0 flex-col overflow-hidden rounded-2xl bg-card shadow-sm md:border md:border-border/50">
                    <div className="z-20 shrink-0 rounded-t-2xl bg-card/95 px-5 pb-3 pt-4 backdrop-blur-md">
                        <div className="flex items-center justify-between gap-3">
                            <h1 className="text-[28px] font-bold leading-tight tracking-tight text-foreground">
                                Thông báo
                            </h1>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 rounded-full text-muted-foreground hover:bg-muted"
                                onClick={() => void markAllAsRead()}
                                disabled={markAllPending || unreadCount === 0}
                                title="Đánh dấu tất cả đã đọc"
                            >
                                {markAllPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : unreadCount > 0 ? (
                                    <CheckCheck className="h-5 w-5" />
                                ) : (
                                    <MoreHorizontal className="h-5 w-5" />
                                )}
                            </Button>
                        </div>

                        <div className="mt-3 flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setFilter("all")}
                                className={cn(
                                    "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                                    filter === "all"
                                        ? "bg-primary/15 text-primary"
                                        : "text-foreground hover:bg-muted"
                                )}
                            >
                                Tất cả
                            </button>
                            <button
                                type="button"
                                onClick={() => setFilter("unread")}
                                className={cn(
                                    "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                                    filter === "unread"
                                        ? "bg-primary/15 text-primary"
                                        : "text-foreground hover:bg-muted"
                                )}
                            >
                                Chưa đọc
                            </button>
                        </div>
                    </div>

                    <div
                        className="beautiful-scrollbar min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-2"
                        onScroll={handleScroll}
                    >
                        {loading && notifications.length === 0 ? (
                            <div className="flex w-full flex-col gap-2">
                                {Array.from({ length: 6 }).map((_, index) => (
                                    <div key={index} className="flex items-start gap-3 rounded-xl px-3 py-2">
                                        <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
                                        <div className="min-w-0 flex-1 pt-1">
                                            <Skeleton className="h-4 w-3/4" />
                                            <Skeleton className="mt-2 h-3 w-1/3" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : filteredNotifications.length > 0 ? (
                            <div className="flex w-full flex-col">
                                {filteredNotifications.map((notification, index) => (
                                    <div
                                        key={notification._id}
                                        className="animate-in fade-in-0 slide-in-from-bottom-1"
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
                                <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                                    <Inbox className="h-9 w-9 text-muted-foreground/50" />
                                </div>
                                <h3 className="text-base font-semibold text-foreground">
                                    {filter === "unread" ? "Không có thông báo chưa đọc" : "Không có thông báo"}
                                </h3>
                                <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                                    {filter === "unread"
                                        ? "Bạn đã xử lý hết thông báo mới."
                                        : "Các lời mời kết bạn và cập nhật hệ thống sẽ hiển thị tại đây."}
                                </p>
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
};

export default NotificationPage;
