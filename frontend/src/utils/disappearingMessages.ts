import type { Conversation } from "@/types/chat";

export const MIN_DISAPPEARING_DURATION_SECONDS = 60;
export const MAX_DISAPPEARING_DURATION_SECONDS = 30 * 24 * 60 * 60;
export const DEFAULT_DISAPPEARING_DURATION_SECONDS = 24 * 60 * 60;
export const DISAPPEARED_MESSAGE_PLACEHOLDER = "This message has disappeared.";

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

  const initiatorId = conversation.initiatedBy
    || conversation.participants?.[0]?.userId?._id;
  return getReferenceId(initiatorId) === String(userId);
};
