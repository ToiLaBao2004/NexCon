import { Bell, Inbox } from "lucide-react";

const NotificationPage = () => {
    return (
        <div className="flex-1 h-full flex flex-col bg-card/20 rounded-2xl shadow-soft border border-border/40 overflow-hidden">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-border/40 bg-card/50 backdrop-blur-sm">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Bell className="h-5 w-5 text-primary" />
                </div>
                <div>
                    <h1 className="text-lg font-bold text-foreground">Thông báo</h1>
                    <p className="text-xs text-muted-foreground">Không có thông báo mới</p>
                </div>
            </div>

            <div className="flex-1 h-full flex flex-col items-center justify-center py-20 px-6">
                <div className="h-20 w-20 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                    <Inbox className="h-10 w-10 text-muted-foreground/40" />
                </div>
                <h3 className="text-base font-semibold text-muted-foreground/70 mb-1">Không có thông báo</h3>
                <p className="text-sm text-muted-foreground/50 text-center max-w-xs">
                    Các lời mời kết bạn sẽ được hiển thị ở trang "Bạn bè".
                </p>
            </div>
        </div>
    );
};

export default NotificationPage;
