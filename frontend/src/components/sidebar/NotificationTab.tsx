import { Bell } from "lucide-react";

export function NotificationTab() {
    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
                <div className="flex items-center gap-2 mb-2">
                    <Bell className="w-5 h-5 text-primary" />
                    <h3 className="text-lg font-semibold">Thông báo</h3>
                </div>
                <p className="text-sm text-muted-foreground">Chưa có cài đặt thông báo nào.</p>
            </div>
        </div>
    );
}
