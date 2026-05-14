import { Bell } from "lucide-react";
import { usePushNotification } from "@/hooks/usePushNotification";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export function NotificationTab() {
    const {
        subscribed,
        loading,
        isSupported,
        requestPermission,
        subscribe,
        unsubscribe,
    } = usePushNotification();

    const supportsPush = isSupported();

    const handleTogglePush = async (enabled: boolean) => {
        if (!supportsPush) {
            toast.error("Trình duyệt này chưa hỗ trợ Web Push");
            return;
        }

        try {
            if (enabled) {
                if (Notification.permission !== 'granted') {
                    const permission = await requestPermission();
                    if (permission !== 'granted') {
                        toast.error("Bạn cần cấp quyền thông báo để bật Web Push");
                        return;
                    }
                }

                await subscribe();
                toast.success("Đã bật thông báo đẩy");
                return;
            }

            await unsubscribe();
            toast.success("Đã tắt thông báo đẩy");
        } catch {
            toast.error("Không thể cập nhật trạng thái Web Push lúc này");
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
                <div className="flex items-center gap-2">
                    <Bell className="h-5 w-5 text-primary" />
                    <h3 className="text-[18px] font-semibold tracking-tight">Thông báo</h3>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">Quản lý thông báo đẩy cho trình duyệt hiện tại.</p>
            </div>

            <div className="rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                        <p className="text-[15px] font-semibold text-foreground">Thông báo đẩy</p>
                        <p className="text-xs text-muted-foreground">
                            Nhận thông báo ngay cả khi đóng tab.
                        </p>
                        {!supportsPush ? (
                            <p className="text-xs text-destructive">Trình duyệt hiện tại không hỗ trợ Web Push.</p>
                        ) : null}
                    </div>

                    <Switch
                        checked={subscribed}
                        disabled={loading || !supportsPush}
                        onCheckedChange={(checked) => {
                            void handleTogglePush(checked);
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
