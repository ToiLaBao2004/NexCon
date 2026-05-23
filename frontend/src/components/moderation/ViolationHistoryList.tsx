import { Badge } from "@/components/ui/badge";
import type { ViolationHistoryItem } from "@/types/moderation";
import {
  describeViolationSource,
  formatModerationDate,
  moderationCategoryLabels,
  violationStatusLabels,
} from "@/lib/moderationNotice";

interface ViolationHistoryListProps {
  items: ViolationHistoryItem[];
  compact?: boolean;
}

function getReportedContent(item: ViolationHistoryItem) {
  const snapshot = item.metadata?.messageSnapshot;
  const content = String(snapshot?.content || item.metadata?.evidencePreview || "").trim();
  if (content) return content;

  const type = snapshot?.type || item.messageType;
  if (type === "image") return "[Hình ảnh]";
  if (type === "audio") return "[Tin nhắn thoại]";
  if (type === "file") return snapshot?.fileName || "[Tệp đính kèm]";
  if (type === "sticker") return "[Nhãn dán]";
  return "";
}

export function ViolationHistoryList({ items, compact = false }: ViolationHistoryListProps) {
  if (!items.length) {
    return (
      <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-6 text-center text-sm font-medium text-foreground">
        Chưa có lịch sử vi phạm được ghi nhận.
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {items.map((item, index) => {
        const category = item.category || "unknown";
        const status = item.status || "recorded";
        const reportedContent = getReportedContent(item);

        return (
          <article
            key={item._id || `${item.recordedAt}-${index}`}
            className={`rounded-xl border border-border/70 bg-card/80 px-4 py-4 ${compact ? "py-3" : ""}`}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    {moderationCategoryLabels[category] || moderationCategoryLabels.unknown}
                  </h3>
                  <Badge variant="outline" className="rounded-full px-2.5 py-1 text-[11px]">
                    {violationStatusLabels[status] || status}
                  </Badge>
                </div>
                <span className="text-sm text-foreground">{formatModerationDate(item.recordedAt)}</span>
              </div>
              <p className="mt-3 text-sm font-medium leading-6 text-foreground">
                {item.reason || "Nội dung vi phạm tiêu chuẩn cộng đồng."}
              </p>
              {reportedContent && (
                <div className="mt-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Nội dung bị báo cáo</p>
                  <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{reportedContent}</p>
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-foreground">
                <span>{describeViolationSource(item)}</span>
                {item.countAfter ? (
                  <span>
                    Lần {item.countAfter}/{item.threshold || "?"}
                  </span>
                ) : null}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
