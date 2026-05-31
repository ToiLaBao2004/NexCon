import type { Conversation, Message } from "@/types/chat";

export const MIN_DISAPPEARING_DURATION_SECONDS = 60;
export const MAX_DISAPPEARING_DURATION_SECONDS = 30 * 24 * 60 * 60;
export const DEFAULT_DISAPPEARING_AUTO_DISABLE_SECONDS = 24 * 60 * 60;
export const DISAPPEARING_MESSAGE_TTL_SECONDS = 24 * 60 * 60;
export const DISAPPEARED_MESSAGE_PLACEHOLDER = "Tin nhắn này đã biến mất.";

export const DISAPPEARING_DURATION_OPTIONS = [
  { label: "1 phút", value: 60 },
  { label: "5 phút", value: 300 },
  { label: "30 phút", value: 1800 },
  { label: "1 giờ", value: 3600 },
  { label: "6 giờ", value: 21600 },
  { label: "12 giờ", value: 43200 },
  { label: "24 giờ", value: 86400 },
  { label: "7 ngày", value: 604800 },
] as const;

type DisappearingSystemMessageLike = Pick<Message, "systemType" | "metadata" | "content" | "senderInfo">;

export const getDisappearingSystemMessageActorName = (
  message: DisappearingSystemMessageLike,
) => {
  if (typeof message.metadata?.actorName === "string" && message.metadata.actorName.trim()) {
    return message.metadata.actorName.trim();
  }
  if (message.senderInfo?.displayName?.trim()) return message.senderInfo.displayName.trim();
  return "Một thành viên";
};

export const hasDisappearingSystemMessageActor = (
  message: DisappearingSystemMessageLike,
) => (
  message.systemType === "disappearing_messages_enabled"
  || (
    message.systemType === "disappearing_messages_disabled"
    && message.metadata?.autoDisabled !== true
  )
);

export const getDisappearingSystemMessageActionText = (
  message: DisappearingSystemMessageLike,
) => {
  if (message.systemType === "disappearing_messages_enabled") {
    const durationSeconds = Number(message.metadata?.durationSeconds)
      || DEFAULT_DISAPPEARING_AUTO_DISABLE_SECONDS;
    return `đã bật chế độ tin nhắn tự xóa trong ${formatDisappearingDuration(durationSeconds)}. Tin nhắn mới sẽ tự xóa sau 24 giờ. Nhấn để thay đổi.`;
  }

  if (message.systemType === "disappearing_messages_disabled") {
    if (message.metadata?.autoDisabled === true) {
      return "Chế độ tin nhắn tự xóa đã tự động tắt. Tin nhắn mới sẽ được giữ lại.";
    }
    return "đã tắt chế độ tin nhắn tự xóa. Tin nhắn mới sẽ được giữ lại.";
  }

  return message.content || "";
};

export const getDisappearingSystemMessageContent = (
  message: DisappearingSystemMessageLike,
) => {
  const actionText = getDisappearingSystemMessageActionText(message);
  if (!hasDisappearingSystemMessageActor(message)) return actionText;
  return `${getDisappearingSystemMessageActorName(message)} ${actionText}`;
};

const getReferenceId = (value: unknown) => {
  if (value && typeof value === "object" && "_id" in value) {
    return String((value as { _id?: unknown })._id || "");
  }
  return String(value || "");
};

export const formatDisappearingDuration = (durationSeconds?: number | null) => {
  if (!durationSeconds) return "Chưa chọn";
  const preset = DISAPPEARING_DURATION_OPTIONS.find((option) => option.value === durationSeconds);
  if (preset) return preset.label;
  if (durationSeconds % 86400 === 0) return `${durationSeconds / 86400} ngày`;
  if (durationSeconds % 3600 === 0) return `${durationSeconds / 3600} giờ`;
  return `${Math.ceil(durationSeconds / 60)} phút`;
};

export const canManageDisappearingMessages = (
  conversation: Conversation,
  userId?: string | null,
) => {
  if (!userId) return false;
  if (conversation.type === "group") {
    return Boolean(conversation.group?.admins?.some(
      (adminId) => getReferenceId(adminId) === String(userId)
    ));
  }

  return Boolean(conversation.participants?.some(
    (participant) => getReferenceId(participant.userId) === String(userId)
  ));
};

export const isDisappearingModeActive = (
  conversation?: Pick<Conversation, "disappearingEnabled" | "disappearingDisableAt"> | null,
  at = Date.now(),
) => {
  if (conversation?.disappearingEnabled !== true) return false;
  if (!conversation.disappearingDisableAt) return true;
  return new Date(conversation.disappearingDisableAt).getTime() > at;
};

export const isMessageExpired = (
  message?: Pick<Message, "isExpired" | "expiresAt"> | null,
  at = Date.now(),
) => {
  if (message?.isExpired === true) return true;
  if (!message?.expiresAt) return false;
  return new Date(message.expiresAt).getTime() <= at;
};
