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
  pending: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300",
  reviewing: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800/60 dark:bg-sky-950/30 dark:text-sky-300",
  resolved: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300",
  dismissed: "border-border bg-muted text-muted-foreground",
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

function ReportCard({ report }: { report: MyReport }) {
  const isMessage = report.targetType === "message";
  const preview = getMessagePreview(report);
  const description = report.description?.trim();

  return (
    <article className="group border-b border-border/60 px-4 py-4 transition-colors hover:bg-muted/30 md:px-5">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="flex min-w-0 gap-3">
          <div
            className={cn(
              "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border",
              isMessage
                ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-300"
                : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-300"
            )}
          >
            {isMessage ? <MessageSquare className="size-4.5" /> : <UserRound className="size-4.5" />}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-sm font-semibold text-foreground">
                {isMessage ? "Báo cáo tin nhắn" : "Báo cáo người dùng"}
              </h2>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="truncate text-sm text-muted-foreground">{getTargetName(report)}</span>
            </div>

            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {getTargetSubtitle(report)}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground">
                {reasonLabels[report.reasonCategory] || "Khác"}
              </span>
              {isMessage && report.messageSnapshot?.type && (
                <span className="rounded-md border border-border/70 px-2 py-1 text-xs text-muted-foreground">
                  {report.messageSnapshot.type}
                </span>
              )}
            </div>

            {preview && (
              <div className="mt-3 rounded-md border border-border/60 bg-background px-3 py-2 text-sm text-muted-foreground">
                <p className="line-clamp-2 break-words">{preview}</p>
              </div>
            )}

            {description && (
              <p className="mt-3 text-sm leading-relaxed text-foreground/80">
                {description}
              </p>
            )}

            {report.resolution?.reporterMessage && (
              <p className="mt-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm leading-relaxed text-foreground/80">
                {report.resolution.reporterMessage}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pl-12 md:flex-col md:items-end md:pl-0">
          <Badge variant="outline" className={cn("border", statusClassNames[report.status])}>
            {statusLabels[report.status] || report.status}
          </Badge>
          <span className="text-xs text-muted-foreground">{formatReportTime(report.createdAt)}</span>
        </div>
      </div>
    </article>
  );
}

function ReportSkeleton() {
  return (
    <div className="divide-y divide-border/60 rounded-lg border border-border/60 bg-card">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex gap-3 px-5 py-4">
          <div className="size-9 shrink-0 animate-pulse rounded-md bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-48 animate-pulse rounded bg-muted" />
            <div className="h-3 w-64 max-w-full animate-pulse rounded bg-muted" />
            <div className="h-9 w-full animate-pulse rounded bg-muted" />
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
    <div className={cn("flex h-full min-h-0 flex-col", embedded ? "bg-background" : "bg-background")}>
      <header className={cn("shrink-0 border-b border-border/60", embedded ? "px-0 pb-4" : "px-4 py-4 md:px-6")}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            {onBack && (
              <Button variant="ghost" size="icon" className="size-8 rounded-md" onClick={onBack}>
                <ArrowLeft className="size-4" />
              </Button>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Flag className="size-4 text-destructive" />
                <h1 className={cn("truncate font-semibold text-foreground", embedded ? "text-lg" : "text-xl md:text-2xl")}>
                  Lịch sử báo cáo
                </h1>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Theo dõi các báo cáo bạn đã gửi và trạng thái xử lý.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Hiển thị {reports.length} báo cáo gần nhất.
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-md mr-6"
            disabled={loading || refreshing}
            onClick={() => void loadReports("refresh")}
          >
            {refreshing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            Làm mới
          </Button>
        </div>
      </header>

      <main className={cn("beautiful-scrollbar min-h-0 flex-1 overflow-y-auto", embedded ? "pt-4" : "p-4 md:p-6")}>
        <div className={cn("mx-auto w-full", embedded ? "max-w-none" : "max-w-6xl")}>
          {loading ? (
            <ReportSkeleton />
          ) : error ? (
            <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-lg border border-border/60 bg-card px-6 py-12 text-center">
              <FileText className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button variant="outline" onClick={() => void loadReports("refresh")}>
                Thử lại
              </Button>
            </div>
          ) : reports.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-border/60 bg-card">
              {reports.map((report) => (
                <ReportCard key={report._id} report={report} />
              ))}
            </div>
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center rounded-lg border border-border/60 bg-card px-6 py-12 text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-md bg-muted">
                <Inbox className="size-6 text-muted-foreground" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Không có báo cáo nào</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
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
