import { Check, Eye, EyeOff, Loader2, Radio } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { useAuthStore } from "@/stores/useAuthStore";
import { useSocketStore } from "@/stores/useSocketStore";
import type { UserPresenceStatus } from "@/types/user";
import { getPresenceForUser, getPresenceText } from "@/utils/userPresence";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const MANUAL_STATUS_OPTIONS: {
  status: Exclude<UserPresenceStatus, "offline">;
  label: string;
  dotClass: string;
}[] = [
  { status: "online", label: "Trực tuyến", dotClass: "bg-emerald-500" },
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
  const presenceText = getPresenceText(presence);

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
        <DropdownMenuSubTrigger className="cursor-pointer py-2">
          <Radio className="mr-2 h-4 w-4 text-primary" />
          <span className="flex-1">Trạng thái</span>
          <span className="max-w-[120px] truncate text-xs text-muted-foreground">
            {presenceText}
          </span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-72 p-1" sideOffset={8}>
          <DropdownMenuLabel className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Chọn trạng thái
          </DropdownMenuLabel>
          <DropdownMenuItem
            className="cursor-pointer py-2.5"
            onSelect={(event) => {
              event.preventDefault();
              void applyStatus("auto", { status_mode: "auto" });
            }}
          >
            <Radio className="mr-2 h-4 w-4 text-primary" />
            <div className="min-w-0 flex-1">
              <span className="block truncate">Tự động</span>
              <span className="block truncate text-xs text-muted-foreground">
                Theo kết nối realtime
              </span>
            </div>
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
                className="cursor-pointer py-2.5"
                onSelect={(event) => {
                  event.preventDefault();
                  void applyStatus(option.status, {
                    status_mode: "manual",
                    manual_status: option.status,
                  });
                }}
              >
                <span className={cn("mr-2 h-3 w-3 rounded-full", option.dotClass)} />
                <span className="flex-1 truncate">{option.label}</span>
                {savingKey === option.status ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : selected ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : null}
              </DropdownMenuItem>
            );
          })}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="cursor-pointer py-2.5"
            onSelect={(event) => {
              event.preventDefault();
              void applyStatus("activity", { show_activity: !showActivity });
            }}
          >
            {showActivity ? (
              <Eye className="mr-2 h-4 w-4 text-primary" />
            ) : (
              <EyeOff className="mr-2 h-4 w-4 text-muted-foreground" />
            )}
            <span className="flex-1">Hiển thị hoạt động</span>
            {savingKey === "activity" ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <Switch checked={showActivity} className="ml-2" />
            )}
          </DropdownMenuItem>
          {!showActivity && (
            <div className="px-3 pb-2 text-xs leading-snug text-muted-foreground">
              Bạn vẫn nhận tin nhắn và cuộc gọi realtime; người khác chỉ thấy bạn ngoại tuyến.
            </div>
          )}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </>
  );
}
