import { useState } from "react";
import { Clock3 } from "lucide-react";
import { toast } from "sonner";
import type { Conversation, Message } from "@/types/chat";
import { useAuthStore } from "@/stores/useAuthStore";
import { useChatStore } from "@/stores/useChatStore";
import {
  DEFAULT_DISAPPEARING_AUTO_DISABLE_SECONDS,
  canManageDisappearingMessages,
  getDisappearingSystemMessageContent,
} from "@/utils/disappearingMessages";
import { DurationPickerModal } from "./DurationPickerModal";
import { SystemMessagePill } from "./SystemMessagePill";

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
      <SystemMessagePill
        icon={<Clock3 className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />}
        onClick={isEnabledMessage ? () => setPickerOpen(true) : undefined}
      >
        {getDisappearingSystemMessageContent(message)}
      </SystemMessagePill>

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
