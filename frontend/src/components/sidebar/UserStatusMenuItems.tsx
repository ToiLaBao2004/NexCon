import { Check, Eye, EyeOff, Loader2, Radio } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { useAuthStore } from "@/stores/useAuthStore";
import { useSocketStore } from "@/stores/useSocketStore";
import type { UserPresenceStatus } from "@/types/user";
import { getPresenceForUser } from "@/utils/userPresence";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const MANUAL_STATUS_OPTIONS: {
  status: Exclude<UserPresenceStatus, "offline">;
  label: string;
  dotClass: string;
}[] = [
  { status: "online", label: "Đang hoạt động", dotClass: "bg-emerald-500" },
  { status: "away", label: "Vắng mặt", dotClass: "bg-amber-400" },
  { status: "busy", label: "Bận", dotClass: "bg-red-500" },
  { status: "do_not_disturb", label: "Không làm phiền", dotClass: "bg-red-600" },
  { status: "invisible", label: "Ẩn trạng thái", dotClass: "bg-zinc-400" },
];

export function UserStatusMenuItems() {
  const { user, updateMyStatus } = useAuthStore();
  const { onlineUsers, userPresences } = useSocketStore();
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const presence = getPresenceForUser(
    user?._id,
    userPresences,
    user?.presence ?? null,
    onlineUsers,
  );
  const currentMode = presence?.status_mode ?? "auto";
  const currentManualStatus = presence?.manual_status ?? "online";
  const showActivity = presence?.show_activity !== false;
  const currentStatusOption = MANUAL_STATUS_OPTIONS.find((option) => option.status === currentManualStatus);
  const statusLabel = currentMode === "auto" ? "Tự động" : currentStatusOption?.label || "Đang hoạt động";
  const statusDotClass = currentMode === "auto" ? "bg-primary" : currentStatusOption?.dotClass || "bg-emerald-500";

  const applyStatus = async (
    key: string,
    data: Parameters<typeof updateMyStatus>[0],
  ) => {
    try {
      setSavingKey(key);
      await updateMyStatus(data);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể cập nhật trạng thái.");
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="h-9 cursor-pointer py-1.5 text-sm focus:bg-muted/50 data-[state=open]:bg-muted/50 data-[state=open]:text-foreground">
          <span className={cn("mr-2 h-3 w-3 rounded-full", statusDotClass)} />
          <span className="flex-1">Trạng thái</span>
          <span className="max-w-28 truncate text-xs text-foreground/70">{statusLabel}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-48">
          <DropdownMenuItem
            className="h-8 cursor-pointer py-1.5 text-sm focus:bg-muted/50 focus:text-foreground"
            onSelect={(event) => {
              event.preventDefault();
              void applyStatus("auto", { status_mode: "auto" });
            }}
          >
            <Radio className="mr-2 h-4 w-4 text-foreground" />
            <span className="flex-1">Tự động</span>
            {savingKey === "auto" ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : currentMode === "auto" ? (
              <Check className="h-4 w-4 text-primary" />
            ) : null}
          </DropdownMenuItem>

          {MANUAL_STATUS_OPTIONS.map((option) => {
            const selected = currentMode === "manual" && currentManualStatus === option.status;
            return (
              <DropdownMenuItem
                key={option.status}
                className="h-8 cursor-pointer py-1.5 text-sm focus:bg-muted/50 focus:text-foreground"
                onSelect={(event) => {
                  event.preventDefault();
                  void applyStatus(option.status, {
                    status_mode: "manual",
                    manual_status: option.status,
                  });
                }}
              >
                <span className={cn("mr-2 h-3 w-3 rounded-full", option.dotClass)} />
                <span className="flex-1">{option.label}</span>
                {savingKey === option.status ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : selected ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      <DropdownMenuSeparator />
      <DropdownMenuItem
        className="h-9 cursor-pointer py-1.5 text-sm focus:bg-muted/50 focus:text-foreground"
        onSelect={(event) => {
          event.preventDefault();
          void applyStatus("activity", { show_activity: !showActivity });
        }}
      >
        {showActivity ? (
          <Eye className="mr-2 h-4 w-4 text-foreground" />
        ) : (
          <EyeOff className="mr-2 h-4 w-4 text-foreground" />
        )}
        <span className="flex-1">Hiển thị hoạt động</span>
        {savingKey === "activity" ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <Switch checked={showActivity} className="ml-2" />
        )}
      </DropdownMenuItem>
      {!showActivity && (
        <div className="px-3 pb-2 text-xs leading-snug text-foreground/70">
          Bạn vẫn nhận tin nhắn và cuộc gọi realtime; người khác chỉ thấy bạn ngoại tuyến.
        </div>
      )}
    </>
  );
}
