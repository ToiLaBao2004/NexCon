import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatOnlineTime = (date: Date) => {
  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - date.getTime());

  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffMins < 60) {
    return `${diffMins}m`; // 5m, 45m
  } else if (diffHours < 24) {
    return `${diffHours}h`; // 3h, 20h
  } else if (diffDays < 30) {
    return `${diffDays}d`; // 1d, 12d
  } else if (diffMonths < 12) {
    return `${diffMonths}m`; // 1m, 2m, 11m
  } else {
    return `${diffYears}y`; // 1y, 2y
  }
};

export const removeAccents = (str: string) => {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/\u031b/g, "")
    .normalize("NFC");
};

export const formatMessageTime = (date: Date) => {
  const now = new Date();

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  const timeStr = date.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  if (isToday) {
    return timeStr; // ví dụ: "14:35"
  } else if (isYesterday) {
    return `Hôm qua ${timeStr}`; // ví dụ: "Hôm qua 23:10"
  } else if (date.getFullYear() === now.getFullYear()) {
    return `${date.getDate()}/${date.getMonth() + 1} ${timeStr}`; // ví dụ: "22/9 09:15"
  } else {
    return `${date.getDate()}/${date.getMonth() + 1
      }/${date.getFullYear()} ${timeStr}`; // ví dụ: "15/12/2023 18:40"
  }
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(seconds: number): string | null {
  if (seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const URL_REGEX = /^(?:https?:\/\/)?([\w-]+(\.[\w-]+)+)(\/[-\w\-.\/?%&=+#]*)?$/i;
export const isUrl = (text: string) => URL_REGEX.test(text.trim());

export const normalizeUrl = (raw: string) => {
  if (!raw) return raw;
  const t = raw.trim();
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
};

/** Date string → "ngày/tháng/năm, giờ:phút:giây" (vi-VN locale) */
export function formatLocaleTime(dateString: string): string {
  return new Date(dateString).toLocaleString("vi-VN");
}

/**
 * Live call timer: seconds → "mm:ss" or "h:mm:ss" with zero-padded minutes.
 * Always returns a valid string (0 → "00:00").
 */
export function formatCallTimer(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}

/** Extract lowercase file extension from a filename. e.g. "foo.PDF" → "pdf" */
export function getFileExt(fileName: string = ""): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

const AVATAR_PALETTE = [
  "#7c3aed", "#2563eb", "#0891b2", "#059669",
  "#d97706", "#dc2626", "#be185d", "#0284c7",
];

/** Deterministic avatar background color derived from a display name. */
export function nameToColor(name: string): string {
  let h = 0;
  for (const c of name) h = Math.imul(31, h) + c.charCodeAt(0);
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

/** Return YouTube hqdefault thumbnail URL, or null if not a YouTube link. */
export function getYouTubeThumbnail(url: string): string | null {
  try {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      u = new URL("https://" + url);
    }
    if (u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be")) {
      const id = u.hostname.includes("youtu.be")
        ? u.pathname.slice(1)
        : u.searchParams.get("v") ?? "";
      if (id) return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
    }
  } catch {}
  return null;
}