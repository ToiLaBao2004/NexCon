import { Check, ChevronRight, Loader2, Radio } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthStore } from "@/stores/useAuthStore";
import { useSocketStore } from "@/stores/useSocketStore";
import type { UserPresenceStatus } from "@/types/user";
import { getPresenceForUser, getPresenceText } from "@/utils/userPresence";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/lib/apiMessage";

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

type UserStatusMenuItemsProps = {
  mobileInline?: boolean;
};

export function UserStatusMenuItems({
  mobileInline = false,
}: UserStatusMenuItemsProps = {}) {
  const { user, updateMyStatus } = useAuthStore();
  const { onlineUsers, userPresences } = useSocketStore();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);

  const presence = getPresenceForUser(
    user?._id,
    userPresences,
    user?.presence ?? null,
    onlineUsers,
  );
  const currentMode = presence?.status_mode ?? "auto";
  const currentManualStatus = presence?.manual_status ?? "online";
  const presenceText = getPresenceText(presence);

  const applyStatus = async (
    key: string,
    data: Parameters<typeof updateMyStatus>[0],
  ) => {
    try {
      setSavingKey(key);
      await updateMyStatus(data);
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, "Không thể cập nhật trạng thái."));
    } finally {
      setSavingKey(null);
    }
  };

  if (mobileInline) {
    return (
      <>
        <DropdownMenuSeparator />
        {mobilePanelOpen && (
          <div className="mb-1 rounded-md border border-border/60 bg-popover p-1 shadow-lg">
            <div className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Chọn trạng thái
            </div>
            <button
              className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-2.5 text-left text-sm outline-hidden hover:bg-accent hover:text-accent-foreground"
              disabled={savingKey !== null}
              type="button"
              onClick={() => {
                void applyStatus("auto", { status_mode: "auto" }).then(() => setMobilePanelOpen(false));
              }}
            >
              <Radio className="h-4 w-4 text-primary" />
              <div className="min-w-0 flex-1">
                <span className="block truncate">Tự động</span>
              </div>
              {savingKey === "auto" ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : currentMode === "auto" ? (
                <Check className="h-4 w-4 text-primary" />
              ) : null}
            </button>

            {MANUAL_STATUS_OPTIONS.map((option) => {
              const selected = currentMode === "manual" && currentManualStatus === option.status;
              return (
                <button
                  key={option.status}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-2.5 text-left text-sm outline-hidden hover:bg-accent hover:text-accent-foreground disabled:cursor-default disabled:opacity-60"
                  disabled={savingKey !== null}
                  type="button"
                  onClick={() => {
                    void applyStatus(option.status, {
                      status_mode: "manual",
                      manual_status: option.status,
                    }).then(() => setMobilePanelOpen(false));
                  }}
                >
                  <span className={cn("h-3 w-3 rounded-full", option.dotClass)} />
                  <span className="flex-1 truncate">{option.label}</span>
                  {savingKey === option.status ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : selected ? (
                    <Check className="h-4 w-4 text-primary" />
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
        <DropdownMenuItem
          className="cursor-pointer py-2"
          onSelect={(event) => {
            event.preventDefault();
            setMobilePanelOpen((open) => !open);
          }}
        >
          <Radio className="mr-2 h-4 w-4 text-primary" />
          <span className="flex-1">Trạng thái</span>
          <span className="max-w-[96px] truncate text-xs text-muted-foreground">
            {presenceText}
          </span>
          <ChevronRight
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              mobilePanelOpen && "-rotate-90",
            )}
          />
        </DropdownMenuItem>
      </>
    );
  }

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
        <DropdownMenuSubContent className="w-72 max-w-[calc(100vw-2rem)] p-1" sideOffset={8}>
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
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </>
  );
}
