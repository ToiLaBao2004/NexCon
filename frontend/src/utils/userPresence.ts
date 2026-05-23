import type { UserPresence, UserPresenceStatus } from "@/types/user";

export const PRESENCE_LABELS: Record<UserPresenceStatus, string> = {
  online: "Online",
  away: "Away",
  busy: "Busy",
  do_not_disturb: "Do Not Disturb",
  invisible: "Invisible",
  offline: "Offline",
};

export function normalizePresenceStatus(status?: string | null): UserPresenceStatus {
  if (
    status === "online" ||
    status === "away" ||
    status === "busy" ||
    status === "do_not_disturb" ||
    status === "invisible" ||
    status === "offline"
  ) {
    return status;
  }

  return "offline";
}

export function formatRelativeTimeVi(value?: string | null): string | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;

  const diffMs = Math.max(0, Date.now() - timestamp);
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "vừa xong";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 5) return "vài phút trước";
  if (minutes < 60) return `${minutes} phút trước`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} tháng trước`;

  const years = Math.floor(months / 12);
  return `${years} năm trước`;
}

export function getPresenceForUser(
  userId?: string | null,
  presences: Record<string, UserPresence> = {},
  fallbackPresence?: UserPresence | null,
  onlineUsers: string[] = [],
): UserPresence | null {
  if (!userId) return null;
  const id = String(userId);
  if (presences[id]) return presences[id];
  if (fallbackPresence) return fallbackPresence;

  if (onlineUsers.includes(id)) {
    return {
      userId: id,
      status: "online",
      status_mode: "auto",
      manual_status: "online",
      show_activity: true,
      is_online: true,
      last_seen_at: null,
      last_seen_relative: null,
    };
  }

  return null;
}

export function getPresenceBadgeStatus(presence?: UserPresence | null): UserPresenceStatus | undefined {
  const status = normalizePresenceStatus(presence?.status);
  return status === "offline" ? undefined : status;
}

export function getPresenceText(presence?: UserPresence | null): string {
  if (!presence) return PRESENCE_LABELS.offline;
  const status = normalizePresenceStatus(presence.status);

  if (presence.activity_hidden) return PRESENCE_LABELS.offline;
  if (status === "online") return "Đang hoạt động";
  if (status !== "offline") return PRESENCE_LABELS[status];

  const relative = formatRelativeTimeVi(presence.last_seen_at) || presence.last_seen_relative;
  return relative ? `Hoạt động ${relative}` : PRESENCE_LABELS.offline;
}
