import { useState } from "react";
import { Clock3 } from "lucide-react";
import { toast } from "sonner";
import type { Conversation, Message } from "@/types/chat";
import { useAuthStore } from "@/stores/useAuthStore";
import { useChatStore } from "@/stores/useChatStore";
import {
  DEFAULT_DISAPPEARING_AUTO_DISABLE_SECONDS,
  canManageDisappearingMessages,
  getDisappearingSystemMessageActionText,
  getDisappearingSystemMessageActorName,
  getDisappearingSystemMessageContent,
  hasDisappearingSystemMessageActor,
} from "@/utils/disappearingMessages";
import { DurationPickerModal } from "./DurationPickerModal";
import { SystemMessagePill } from "./SystemMessagePill";
import UserAvatar from "./UserAvatar";

const getReferenceId = (value: unknown) => {
  if (value && typeof value === "object" && "_id" in value) {
    return String((value as { _id?: unknown })._id || "");
  }
  return String(value || "");
};

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
  const hasActor = hasDisappearingSystemMessageActor(message);
  const actorId = getReferenceId(message.metadata?.actorId || message.senderId);
  const actor = conversation.participants.find(
    (participant) => getReferenceId(participant.userId) === actorId,
  );
  const actorName = getDisappearingSystemMessageActorName(message);
  const actorAvatarUrl = message.senderInfo?.avatarUrl
    || actor?.userId?.avatarUrl
    || undefined;

  return (
    <>
      <SystemMessagePill
        icon={<Clock3 className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />}
        onClick={isEnabledMessage ? () => setPickerOpen(true) : undefined}
      >
        {hasActor ? (
          <>
            <span className="whitespace-nowrap">
              <span className="mr-1.5 inline-flex align-[-4px]">
                <UserAvatar
                  type="seen"
                  name={actorName}
                  avatarUrl={actorAvatarUrl}
                  className="size-[20px] shrink-0 border border-background shadow-sm"
                />
              </span>
              <span className="font-semibold text-foreground">{actorName}</span>
            </span>{" "}
            {getDisappearingSystemMessageActionText(message)}
          </>
        ) : (
          getDisappearingSystemMessageContent(message)
        )}
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
