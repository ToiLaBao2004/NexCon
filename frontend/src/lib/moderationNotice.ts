import type { ModerationApiErrorPayload, ViolationHistoryItem } from "@/types/moderation";
import { translateApiMessage } from "@/lib/apiMessage";

export const moderationCategoryLabels: Record<string, string> = {
  abusive: "Ngôn từ xúc phạm",
  harassment: "Quấy rối hoặc công kích cá nhân",
  hate: "Ngôn từ thù ghét",
  sexual: "Nội dung tình dục hoặc nhạy cảm",
  dangerous: "Nội dung nguy hiểm",
  scam: "Lừa đảo hoặc giả mạo",
  self_harm: "Tự gây hại",
  spam: "Spam gây hại",
  unsafe_link: "Liên kết không an toàn",
  illegal: "Nội dung bất hợp pháp",
  violence: "Bạo lực hoặc đe dọa",
  safe: "An toàn",
  unknown: "Chưa phân loại",
};

export const violationStatusLabels: Record<string, string> = {
  recorded: "Đã ghi nhận",
  warning_sent: "Đã cảnh báo",
  account_locked: "Đã khóa tài khoản",
  cleared: "Đã xóa hiệu lực",
};

export function formatModerationDate(value?: string | null) {
  if (!value) return "Chưa có";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa có";
  return date.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function getModerationPayload(error: any): ModerationApiErrorPayload | null {
  return error?.response?.data || error?.details || null;
}

export function isModerationBlockError(error: any) {
  const payload = getModerationPayload(error);
  const message = String(error?.message || payload?.message || "").toLowerCase();
  return Boolean(
    payload?.code === "COMMUNITY_STANDARD_VIOLATION" ||
    payload?.moderation ||
    payload?.whatViolated ||
    message.includes("tiêu chuẩn cộng đồng") ||
    message.includes("vi phạm")
  );
}

export function buildModerationNotice(payload?: ModerationApiErrorPayload | null) {
  const category = payload?.whatViolated?.category || payload?.moderation?.category || "unknown";
  const label = moderationCategoryLabels[category]
    || translateApiMessage(payload?.whatViolated?.label, moderationCategoryLabels.unknown);
  const reason = translateApiMessage(
    payload?.whatViolated?.reason || payload?.moderation?.reason || payload?.message,
    "Nội dung không phù hợp với tiêu chuẩn cộng đồng."
  );
  const count = payload?.violation?.count;
  const threshold = payload?.violation?.threshold;
  const blockedUntil = payload?.restriction?.blockedUntil;
  const countLine = count && threshold ? `Lần vi phạm: ${count}/${threshold}.` : "";
  const restrictionLine = translateApiMessage(payload?.restriction?.message || payload?.detail, "");
  const untilLine = blockedUntil ? `Thời gian hạn chế đến: ${formatModerationDate(blockedUntil)}.` : "";

  return {
    title: translateApiMessage(payload?.title, "Nội dung chưa được gửi"),
    description: [label, reason, countLine, restrictionLine, untilLine].filter(Boolean).join("\n"),
    category,
    label,
    reason,
  };
}

export function describeViolationSource(item: ViolationHistoryItem) {
  const source = item.source || "";
  if (source.startsWith("ai_")) return "AI tự động phát hiện";
  if (source.startsWith("admin_report")) return "Admin xác nhận từ báo cáo";
  if (source === "admin_manual") return "Admin ghi nhận thủ công";
  return "Hệ thống kiểm duyệt";
}
