import { useState } from "react";
import { Clock3 } from "lucide-react";
import { toast } from "sonner";
import type { Conversation, Message } from "@/types/chat";
import { useAuthStore } from "@/stores/useAuthStore";
import { useChatStore } from "@/stores/useChatStore";
import {
  DEFAULT_DISAPPEARING_AUTO_DISABLE_SECONDS,
  canManageDisappearingMessages,
} from "@/utils/disappearingMessages";
import { DurationPickerModal } from "./DurationPickerModal";

export function SystemMessageBubble({
  message,
  conversation,
}: {
  message: Message;
  conversation: Conversation;
}) {
  const userId = useAuthStore((state) => state.user?._id);
  const updateSetting = useChatStore((state) => state.updateDisappearingSetting);
  const [pickerOpen, setPickerOpen] = useState(false);
  const isEnabledMessage = message.systemType === "disappearing_messages_enabled";
  const canManage = canManageDisappearingMessages(conversation, userId);
  const duration = Number(message.metadata?.durationSeconds)
    || conversation.disappearingAutoDisableSeconds
    || DEFAULT_DISAPPEARING_AUTO_DISABLE_SECONDS;

  return (
    <>
      <div className="my-4 flex w-full justify-center px-3">
        <button
          type="button"
          disabled={!isEnabledMessage}
          onClick={() => setPickerOpen(true)}
          className="max-w-[92%] rounded-2xl bg-muted/45 px-4 py-2 text-center text-[13px] leading-relaxed text-muted-foreground disabled:cursor-default"
        >
          <Clock3 className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
          {message.content}
        </button>
      </div>

      <DurationPickerModal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        selectedDurationSeconds={duration}
        readOnly={!canManage}
        onConfirm={async (durationSeconds) => {
          try {
            const result = await updateSetting(conversation._id, {
              enabled: true,
              durationSeconds,
            });
            if (result.warning) toast.warning(result.warning);
          } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "Không thể cập nhật tin nhắn tự xóa.");
            throw error;
          }
        }}
      />
    </>
  );
}
