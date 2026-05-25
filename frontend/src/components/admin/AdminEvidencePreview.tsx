import { ExternalLink, FileText, ImageIcon, LinkIcon, Music, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AdminMessage } from "@/services/adminService";
import { decodeMentionTokens } from "@/utils/mentions";

function formatBytes(value?: number) {
  if (!value) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function isTrustedMediaUrl(value?: string | null) {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.protocol === "https:" && (
      url.hostname === "res.cloudinary.com" ||
      url.hostname.endsWith(".cloudinary.com")
    );
  } catch {
    return false;
  }
}

function getDisplayUrl(value?: string) {
  const raw = (value || "").trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return {
      href: parsed.href,
      host: parsed.hostname.replace(/^www\./, ""),
    };
  } catch {
    return null;
  }
}

export default function AdminEvidencePreview({
  message,
  fallbackText = "Không có nội dung xem trước.",
}: {
  message?: AdminMessage | null;
  fallbackText?: string;
}) {
  if (!message) {
    return (
      <div className="rounded-md border border-border/70 bg-muted/30 p-3 text-sm text-muted-foreground">
        {fallbackText}
      </div>
    );
  }

  const safeSignedUrl = isTrustedMediaUrl(message.signedUrl) ? message.signedUrl : null;
  const safeContent = decodeMentionTokens(message.content || "", null, message.mentions);
  const safePreview = decodeMentionTokens(message.preview || "");
  const fileMeta = [message.mimeType, formatBytes(message.fileSize)].filter(Boolean).join(" · ");

  if (message.type === "image") {
    return (
      <div className="overflow-hidden rounded-md border border-border/70">
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-3 py-2 text-sm">
          <span className="inline-flex min-w-0 items-center gap-2">
            <ImageIcon className="size-4 text-muted-foreground" />
            <span className="truncate font-medium">{message.fileName || "Ảnh đính kèm"}</span>
          </span>
          <Badge variant="outline" className="shrink-0">Signed media</Badge>
        </div>
        {safeSignedUrl ? (
          <img
            src={safeSignedUrl}
            alt={message.fileName || "Ảnh bằng chứng"}
            className="max-h-80 w-full bg-muted object-contain"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="p-4 text-sm text-muted-foreground">Không có URL ảnh đã ký an toàn.</div>
        )}
      </div>
    );
  }

  if (message.type === "audio") {
    return (
      <div className="rounded-md border border-border/70 p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <Music className="size-4 text-muted-foreground" />
          Tin nhắn thoại
        </div>
        {safeSignedUrl ? (
          <audio controls src={safeSignedUrl} className="w-full" />
        ) : (
          <p className="text-sm text-muted-foreground">Không có URL âm thanh đã ký an toàn.</p>
        )}
      </div>
    );
  }

  if (message.type === "file") {
    return (
      <div className="rounded-md border border-border/70 p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileText className="size-4 text-muted-foreground" />
              <span className="truncate">{message.fileName || "File đính kèm"}</span>
            </div>
            {fileMeta && <p className="mt-1 text-xs text-muted-foreground">{fileMeta}</p>}
          </div>
          {safeSignedUrl ? (
            <Button asChild variant="outline" size="sm" className="rounded-md">
              <a href={safeSignedUrl} target="_blank" rel="noopener noreferrer" download={message.fileName || undefined}>
                <ExternalLink className="size-4" />
                Mở file đã ký
              </a>
            </Button>
          ) : (
            <Badge variant="secondary">Không có link an toàn</Badge>
          )}
        </div>
      </div>
    );
  }

  if (message.type === "link") {
    const displayUrl = getDisplayUrl(message.content);

    return (
      <div className="rounded-md border border-border/70 p-3">
        <div className="flex items-start gap-3">
          <LinkIcon className="mt-0.5 size-4 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{displayUrl?.host || "Liên kết"}</span>
              <Badge variant="outline" className="gap-1">
                <ShieldCheck className="size-3" />
                Không mở trực tiếp
              </Badge>
            </div>
            <p className="mt-1 break-all text-sm text-muted-foreground">{safeContent || safePreview}</p>
            {displayUrl && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 rounded-md"
                onClick={() => {
                  void navigator.clipboard.writeText(displayUrl.href);
                  toast.success("Đã sao chép link để kiểm tra riêng");
                }}
              >
                Sao chép link
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border/70 bg-muted/30 p-3 text-sm">
      {safePreview || safeContent || fallbackText}
    </div>
  );
}
