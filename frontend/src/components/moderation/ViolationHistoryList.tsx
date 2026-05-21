import { AlertTriangle, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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

export function ViolationHistoryList({ items, compact = false }: ViolationHistoryListProps) {
  if (!items.length) {
    return (
      <div className="rounded-md border border-border/70 bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
        Chưa có lịch sử vi phạm được ghi nhận.
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {items.map((item, index) => {
        const category = item.category || "unknown";
        const status = item.status || "recorded";
        const isLocked = status === "account_locked";

        return (
          <article
            key={item._id || `${item.recordedAt}-${index}`}
            className={cn(
              "rounded-md border px-3 py-3",
              isLocked
                ? "border-destructive/30 bg-destructive/5"
                : "border-border/70 bg-card/80",
              compact && "py-2"
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md",
                  isLocked ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"
                )}
              >
                {isLocked ? <ShieldAlert className="size-4" /> : <AlertTriangle className="size-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="rounded-md">
                    {moderationCategoryLabels[category] || moderationCategoryLabels.unknown}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatModerationDate(item.recordedAt)}
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {item.reason || "Nội dung vi phạm tiêu chuẩn cộng đồng."}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{describeViolationSource(item)}</span>
                  <span>{violationStatusLabels[status] || status}</span>
                  {item.countAfter ? (
                    <span>
                      Lần {item.countAfter}/{item.threshold || "?"}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
