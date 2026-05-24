import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { reportService, type ReportReasonCategory } from "@/services/reportService";

const REPORT_REASONS: Array<{ value: ReportReasonCategory; label: string }> = [
  { value: "spam", label: "Spam hoặc quảng cáo" },
  { value: "harassment", label: "Quấy rối hoặc bắt nạt" },
  { value: "hate_speech", label: "Ngôn từ thù ghét" },
  { value: "sexual_content", label: "Nội dung nhạy cảm" },
  { value: "violence", label: "Bạo lực hoặc đe dọa" },
  { value: "scam", label: "Lừa đảo" },
  { value: "impersonation", label: "Giả mạo" },
  { value: "self_harm", label: "Tự gây hại" },
  { value: "other", label: "Khác" },
];

interface ReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetType: "message" | "user";
  targetId: string;
  targetName?: string;
  conversationId?: string;
  preview?: string | null;
}

export function ReportDialog({
  open,
  onOpenChange,
  targetType,
  targetId,
  targetName,
  conversationId,
  preview,
}: ReportDialogProps) {
  const [reasonCategory, setReasonCategory] = useState<ReportReasonCategory>("spam");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const title = targetType === "message" ? "Báo cáo tin nhắn" : "Báo cáo người dùng";
  const targetLabel = targetName?.trim() || (targetType === "message" ? "tin nhắn này" : "người dùng này");

  const trimmedDescription = description.trim();
  const descriptionCount = description.length;
  const previewText = useMemo(() => {
    const value = String(preview || "").trim();
    if (!value) return null;
    return value.length > 180 ? `${value.slice(0, 180)}...` : value;
  }, [preview]);

  useEffect(() => {
    if (!open) {
      setReasonCategory("spam");
      setDescription("");
      setSubmitting(false);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!targetId || submitting) return;

    try {
      setSubmitting(true);
      const payload = {
        reasonCategory,
        description: trimmedDescription,
        ...(conversationId ? { conversationId } : {}),
      };

      if (targetType === "message") {
        await reportService.reportMessage(targetId, payload);
      } else {
        await reportService.reportUser(targetId, payload);
      }

      toast.success("Đã gửi báo cáo", {
        description: "Cảm ơn bạn đã giúp NexCon an toàn hơn.",
      });
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error?.message || "Không thể gửi báo cáo");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !submitting && onOpenChange(nextOpen)}>
      <DialogContent className="z-[300] !flex max-h-[calc(100dvh-2rem)] w-[92vw] max-w-md flex-col !gap-0 overflow-hidden rounded-2xl p-0 sm:!max-w-md">
        <DialogHeader className="shrink-0 px-5 pt-5 pb-3 text-left">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
              <AlertTriangle className="size-5" strokeWidth={1.8} />
            </div>
            <div className="min-w-0">
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription className="mt-1">
                Báo cáo {targetLabel} để đội ngũ quản trị xem xét.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-4 beautiful-scrollbar">
          {previewText && (
            <div className="rounded-md border bg-muted/35 px-3 py-2 text-sm text-muted-foreground">
              <p className="line-clamp-3 break-all">{previewText}</p>
            </div>
          )}

          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">Lý do</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {REPORT_REASONS.map((reason) => (
                <button
                  key={reason.value}
                  type="button"
                  onClick={() => setReasonCategory(reason.value)}
                  className={cn(
                    "flex min-h-10 items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                    reasonCategory === reason.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <CheckCircle2
                    className={cn(
                      "size-4 shrink-0",
                      reasonCategory === reason.value ? "opacity-100" : "opacity-0"
                    )}
                    strokeWidth={2}
                  />
                  <span className="leading-snug">{reason.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="report-description" className="text-sm font-medium text-foreground">
                Mô tả thêm
              </label>
              <span className="text-xs text-muted-foreground">{descriptionCount}/1000</span>
            </div>
            <Textarea
              id="report-description"
              value={description}
              maxLength={1000}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Thêm chi tiết để quản trị viên hiểu ngữ cảnh..."
              className="min-h-20 resize-none"
            />
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t bg-muted/20 px-5 py-4 sm:justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Hủy
          </Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Gửi báo cáo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
