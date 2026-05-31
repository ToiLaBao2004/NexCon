import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";
import { toast } from "sonner";
import type { Conversation } from "@/types/chat";
import { Switch } from "@/components/ui/switch";
import { useAuthStore } from "@/stores/useAuthStore";
import { useChatStore } from "@/stores/useChatStore";
import {
  DEFAULT_DISAPPEARING_AUTO_DISABLE_SECONDS,
  canManageDisappearingMessages,
  formatDisappearingDuration,
  isDisappearingModeActive,
} from "@/utils/disappearingMessages";
import { DurationPickerModal } from "./DurationPickerModal";

export function DisappearingToggle({ conversation }: { conversation: Conversation }) {
  const userId = useAuthStore((state) => state.user?._id);
  const updateSetting = useChatStore((state) => state.updateDisappearingSetting);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(Date.now());
  const enabled = isDisappearingModeActive(conversation, now);
  const duration = conversation.disappearingAutoDisableSeconds || DEFAULT_DISAPPEARING_AUTO_DISABLE_SECONDS;
  const canManage = canManageDisappearingMessages(conversation, userId);

  useEffect(() => {
    if (!conversation.disappearingDisableAt) return;
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [conversation.disappearingDisableAt]);

  const save = async (payload: { enabled: boolean; durationSeconds?: number }) => {
    try {
      setSaving(true);
      const result = await updateSetting(conversation._id, payload);
      if (result.warning) toast.warning(result.warning);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Không thể cập nhật tin nhắn tự xóa.");
      throw error;
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex w-full items-center gap-3 bg-card px-5 py-3.5">
        <Clock3 className="h-5 w-5 shrink-0 text-foreground" strokeWidth={1.65} />
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => setPickerOpen(true)}
        >
          <span className="block text-[15px] font-normal text-foreground">Tin nhắn tự xóa</span>
          <span className="block truncate text-xs text-muted-foreground">
            {enabled ? `Tự tắt sau ${formatDisappearingDuration(duration)}` : "Đang tắt"}
          </span>
        </button>
        <Switch
          checked={enabled}
          disabled={!canManage || saving}
          aria-label="Bật tin nhắn tự xóa"
          onCheckedChange={(checked) => {
            if (checked) {
              setPickerOpen(true);
            } else {
              void save({ enabled: false });
            }
          }}
        />
      </div>

      <DurationPickerModal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        selectedDurationSeconds={duration}
        readOnly={!canManage}
        onConfirm={(durationSeconds) => save({ enabled: true, durationSeconds })}
      />
    </>
  );
}
