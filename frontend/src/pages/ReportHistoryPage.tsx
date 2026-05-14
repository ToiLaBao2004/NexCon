import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  FileText,
  Flag,
  Inbox,
  Loader2,
  MessageSquare,
  RefreshCw,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  reportService,
  type MyReport,
  type ReportReasonCategory,
  type ReportStatus,
} from "@/services/reportService";

const reasonLabels: Record<ReportReasonCategory, string> = {
  spam: "Spam hoặc quảng cáo",
  harassment: "Quấy rối hoặc bắt nạt",
  hate_speech: "Ngôn từ thù ghét",
  sexual_content: "Nội dung nhạy cảm",
  violence: "Bạo lực hoặc đe dọa",
  scam: "Lừa đảo",
  impersonation: "Giả mạo",
  self_harm: "Tự gây hại",
  other: "Khác",
};

const statusLabels: Record<ReportStatus, string> = {
  pending: "Đang chờ",
  reviewing: "Đang xem xét",
  resolved: "Đã xử lý",
  dismissed: "Đã bỏ qua",
};

const statusClassNames: Record<ReportStatus, string> = {
  pending: "border-amber-200/70 bg-amber-50/80 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/12 dark:text-amber-200",
  reviewing: "border-sky-200/70 bg-sky-50/80 text-sky-700 dark:border-sky-400/25 dark:bg-sky-400/12 dark:text-sky-200",
  resolved: "border-emerald-200/70 bg-emerald-50/80 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/12 dark:text-emerald-200",
  dismissed: "border-slate-200/70 bg-slate-50/80 text-slate-600 dark:border-slate-400/25 dark:bg-slate-400/12 dark:text-slate-200",
};

function formatReportTime(dateString?: string) {
  if (!dateString) return "";
  return new Date(dateString).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getTargetName(report: MyReport) {
  return report.targetUserSnapshot?.displayName || report.messageSnapshot?.senderInfo?.displayName || "Người dùng";
}

function getTargetSubtitle(report: MyReport) {
  if (report.targetType === "user") {
    return report.targetUserSnapshot?.email || "Người dùng được báo cáo";
  }

  const messageType = report.messageSnapshot?.type;
  if (messageType === "image") return "Tin nhắn hình ảnh";
  if (messageType === "audio") return "Tin nhắn thoại";
  if (messageType === "file") return report.messageSnapshot?.fileName || "Tệp đính kèm";
  if (messageType === "sticker") return "Nhãn dán";
  return "Tin nhắn trong hội thoại";
}

function getMessagePreview(report: MyReport) {
  if (report.targetType !== "message") return null;

  const messageType = report.messageSnapshot?.type;
  if (messageType === "image") return "[Hình ảnh]";
  if (messageType === "audio") return "[Tin nhắn thoại]";
  if (messageType === "file") return report.messageSnapshot?.fileName || "[File]";
  if (messageType === "sticker") return "[Nhãn dán]";
  return report.messageSnapshot?.content || "[Tin nhắn]";
}



function ReportCard({ report, index = 0 }: { report: MyReport; index?: number }) {
  const isMessage = report.targetType === "message";
  const preview = getMessagePreview(report);
  const description = report.description?.trim();

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-[hsl(var(--report-line))]",
        "bg-[hsl(var(--report-card))] shadow-[0_12px_30px_-24px_hsl(var(--report-ink)/0.6)]",
        "px-4 py-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-28px_hsl(var(--report-ink)/0.7)]",
        "animate-in fade-in slide-in-from-bottom-2 duration-500"
      )}
      style={{ animationDelay: `${Math.min(index * 40, 200)}ms` }}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <div
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-xl border",
              isMessage
                ? "border-sky-200/70 bg-sky-50/80 text-sky-700 dark:border-sky-400/25 dark:bg-sky-400/12 dark:text-sky-200"
                : "border-rose-200/70 bg-rose-50/80 text-rose-700 dark:border-rose-400/25 dark:bg-rose-400/12 dark:text-rose-200"
            )}
          >
            {isMessage ? <MessageSquare className="size-4.5" /> : <UserRound className="size-4.5" />}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-[15px] font-semibold text-[hsl(var(--report-ink))]">
                {isMessage ? "Báo cáo tin nhắn" : "Báo cáo người dùng"}
              </h2>
              <span className="text-xs text-[hsl(var(--report-muted))]">•</span>
              <span className="truncate text-[13px] text-[hsl(var(--report-muted))]">{getTargetName(report)}</span>
            </div>

            <p className="mt-1 truncate text-[13px] text-[hsl(var(--report-muted))]">
              {getTargetSubtitle(report)}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[hsl(var(--report-chip))] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[hsl(var(--report-chip-ink))]">
                {reasonLabels[report.reasonCategory] || "Khác"}
              </span>
            </div>

            {preview && (
              <div className="mt-3 rounded-xl border border-[hsl(var(--report-line))] bg-[hsl(var(--report-soft))] px-3 py-2 text-[13px] text-[hsl(var(--report-muted))]">
                <p className="line-clamp-2 break-words">{preview}</p>
              </div>
            )}

            {description && (
              <div className="mt-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--report-muted))]">
                  Ghi chú của bạn
                </p>
                <p className="mt-1 text-[14px] leading-relaxed text-[hsl(var(--report-ink)/0.78)]">
                  {description}
                </p>
              </div>
            )}

            {report.resolution?.reporterMessage && (
              <p className="mt-3 rounded-xl border border-[hsl(var(--report-line))] bg-[hsl(var(--report-soft))] px-3 py-2 text-[13px] leading-relaxed text-[hsl(var(--report-ink)/0.78)]">
                {report.resolution.reporterMessage}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 md:flex-col md:items-end">
          <Badge
            variant="outline"
            className={cn(
              "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]",
              statusClassNames[report.status]
            )}
          >
            {statusLabels[report.status] || report.status}
          </Badge>
          <span className="text-[12px] text-[hsl(var(--report-muted))]">{formatReportTime(report.createdAt)}</span>
        </div>
      </div>
    </article>
  );
}

function ReportSkeleton() {
  return (
    <div className="grid gap-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="flex gap-4 rounded-2xl border border-border/60 bg-card/80 px-4 py-4"
        >
          <div className="size-10 shrink-0 animate-pulse rounded-xl bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-48 animate-pulse rounded bg-muted" />
            <div className="h-3 w-64 max-w-full animate-pulse rounded bg-muted" />
            <div className="h-8 w-full animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface ReportHistoryContentProps {
  embedded?: boolean;
  onBack?: () => void;
}

export function ReportHistoryContent({ embedded = false, onBack }: ReportHistoryContentProps) {
  const [reports, setReports] = useState<MyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReports = async (mode: "initial" | "refresh" = "initial") => {
    try {
      if (mode === "initial") setLoading(true);
      if (mode === "refresh") setRefreshing(true);
      setError(null);
      const result = await reportService.getMyReports();
      setReports(result.reports);
    } catch (err: any) {
      setError(err?.message || "Không thể tải lịch sử báo cáo.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadReports();
  }, []);

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 flex-col overflow-x-hidden font-[\"Space Grotesk\"]",
        "[--report-ink:222_47%_11%] [--report-muted:215_18%_40%] [--report-line:214_32%_88%]",
        "[--report-card:0_0%_100%] [--report-soft:210_40%_96%] [--report-chip:210_50%_96%] [--report-chip-ink:210_40%_25%]",
        "dark:[--report-ink:210_40%_96%] dark:[--report-muted:215_20%_72%] dark:[--report-line:217_32%_22%]",
        "dark:[--report-card:222_47%_9%] dark:[--report-soft:222_47%_14%] dark:[--report-chip:217_32%_18%] dark:[--report-chip-ink:210_40%_88%]",
        embedded ? "bg-transparent" : "bg-[hsl(var(--report-soft))]"
      )}
    >
      <div className={cn("pointer-events-none absolute inset-0 -z-10", embedded ? "opacity-40" : "opacity-70")}>
        <div className="absolute inset-0 bg-[radial-gradient(80%_120%_at_20%_0%,hsl(210_90%_56%/0.18)_0%,transparent_60%)]" />
      </div>

      <header className={cn("sticky top-0 z-20 shrink-0", embedded ? "px-0 pb-4" : "px-4 py-4 md:px-6")}>
        <div className={cn(
          "rounded-2xl border border-[hsl(var(--report-line))] bg-[hsl(var(--report-card)/0.86)] backdrop-blur-xl",
          embedded ? "px-3 py-3" : "px-4 py-4 md:px-5"
        )}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              {onBack && (
                <Button variant="ghost" size="icon" className="size-9 rounded-full" onClick={onBack}>
                  <ArrowLeft className="size-4" />
                </Button>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-xl bg-[hsl(var(--report-soft))] text-[hsl(var(--report-ink))]">
                    <Flag className="size-4" />
                  </span>
                  <h1 className={cn("truncate font-semibold text-[hsl(var(--report-ink))]", embedded ? "text-lg" : "text-xl md:text-2xl")}>
                    Lịch sử báo cáo
                  </h1>
                </div>
                <p className="mt-2 text-[13px] text-[hsl(var(--report-muted))]">
                  Theo dõi các báo cáo bạn đã gửi và trạng thái xử lý.
                </p>
                <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-[hsl(var(--report-line))] bg-[hsl(var(--report-card))] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--report-muted))]">
                  {reports.length} báo cáo gần nhất
                </div>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="h-9 shrink-0 rounded-full border-[hsl(var(--report-line))] bg-[hsl(var(--report-card)/0.86)] text-[12px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--report-ink))]"
              disabled={loading || refreshing}
              onClick={() => void loadReports("refresh")}
            >
              {refreshing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              Làm mới
            </Button>
          </div>
        </div>
      </header>

      <main className={cn("beautiful-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden", embedded ? "pt-4" : "p-4 md:p-6")}>
        <div className={cn("mx-auto w-full min-w-0", embedded ? "max-w-none" : "max-w-5xl")}>
          {loading ? (
            <ReportSkeleton />
          ) : error ? (
            <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-2xl border border-[hsl(var(--report-line))] bg-[hsl(var(--report-card)/0.86)] px-6 py-12 text-center">
              <FileText className="size-8 text-[hsl(var(--report-muted))]" />
              <p className="text-[13px] text-[hsl(var(--report-muted))]">{error}</p>
              <Button variant="outline" onClick={() => void loadReports("refresh")}>
                Thử lại
              </Button>
            </div>
          ) : reports.length > 0 ? (
            <div className="grid gap-3">
              {reports.map((report, index) => (
                <ReportCard key={report._id} report={report} index={index} />
              ))}
            </div>
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-[hsl(var(--report-line))] bg-[hsl(var(--report-card)/0.86)] px-6 py-12 text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-[hsl(var(--report-soft))]">
                <Inbox className="size-6 text-[hsl(var(--report-muted))]" />
              </div>
              <h3 className="text-[14px] font-semibold text-[hsl(var(--report-ink))]">Không có báo cáo nào</h3>
              <p className="mt-1 max-w-sm text-[13px] text-[hsl(var(--report-muted))]">
                Các báo cáo bạn đã gửi sẽ xuất hiện tại đây.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function ReportHistoryPage() {
  const navigate = useNavigate();

  return (
    <div className="relative flex h-full flex-1 overflow-hidden rounded-none border-0 bg-background md:rounded-l-none md:rounded-r-2xl md:border-y md:border-r md:border-l-0 md:border-border/50">
      <ReportHistoryContent onBack={() => navigate(-1)} />
    </div>
  );
}
