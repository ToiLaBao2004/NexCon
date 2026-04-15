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
                <div className="flex items-center gap-2 mb-2">
                    <Bell className="w-5 h-5 text-primary" />
                    <h3 className="text-lg font-semibold">Thông báo</h3>
                </div>
                <p className="text-sm text-muted-foreground">Quản lý thông báo đẩy cho trình duyệt hiện tại.</p>
            </div>

            <div className="rounded-lg border border-border/60 bg-card p-4">
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                        <p className="text-sm font-medium">Thông báo đẩy</p>
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
