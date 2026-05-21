import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Flag,
  Inbox,
  Loader2,
  MessageSquare,
  RefreshCw,
  UserRound,
  XCircle,
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
  pending: "border-amber-300/60 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200",
  reviewing: "border-sky-300/60 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200",
  resolved: "border-emerald-300/60 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200",
  dismissed: "border-slate-300/70 bg-slate-50 text-slate-600 dark:border-slate-400/25 dark:bg-slate-400/10 dark:text-slate-200",
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

function getReportStats(reports: MyReport[]) {
  return reports.reduce(
    (acc, report) => {
      acc.total += 1;
      acc[report.status] += 1;
      if (report.targetType === "message") acc.message += 1;
      if (report.targetType === "user") acc.user += 1;
      return acc;
    },
    {
      total: 0,
      pending: 0,
      reviewing: 0,
      resolved: 0,
      dismissed: 0,
      message: 0,
      user: 0,
    } satisfies Record<ReportStatus | "total" | "message" | "user", number>
  );
}

function ReportCard({ report, index = 0, embedded = false }: { report: MyReport; index?: number; embedded?: boolean }) {
  const isMessage = report.targetType === "message";
  const preview = getMessagePreview(report);
  const description = report.description?.trim();
  const resolutionMessage = report.resolution?.reporterMessage?.trim();

  return (
    <article
      className={cn(
        "rounded-md border bg-card px-4 py-4 shadow-sm transition-colors hover:border-primary/30",
        embedded ? "border-border/60" : "border-border/70",
        "animate-in fade-in slide-in-from-bottom-1 duration-300"
      )}
      style={{ animationDelay: `${Math.min(index * 35, 160)}ms` }}
    >
      <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 gap-3">
          <div
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-md border",
              isMessage
                ? "border-sky-400/25 bg-sky-500/10 text-sky-500"
                : "border-rose-400/25 bg-rose-500/10 text-rose-500"
            )}
          >
            {isMessage ? <MessageSquare className="size-4" /> : <UserRound className="size-4" />}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="truncate text-[15px] font-semibold text-foreground">
                {isMessage ? "Báo cáo tin nhắn" : "Báo cáo người dùng"}
              </h2>
              <span className="text-muted-foreground">·</span>
              <span className="truncate text-sm text-muted-foreground">{getTargetName(report)}</span>
            </div>

            <p className="mt-1 truncate text-sm text-muted-foreground">{getTargetSubtitle(report)}</p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-muted px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-foreground/80">
                {reasonLabels[report.reasonCategory] || "Khác"}
              </span>
              {report.resolution?.decision && (
                <span className="rounded-md border border-border/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  {report.resolution.decision === "violation" ? "Có vi phạm" : "Không đủ cơ sở"}
                </span>
              )}
            </div>

            {(preview || description || resolutionMessage) && (
              <div className="mt-3 grid gap-2">
                {preview && (
                  <div className="rounded-md border border-border/60 bg-muted/35 px-3 py-2 text-sm text-foreground/80">
                    <p className="line-clamp-2 break-words">{preview}</p>
                  </div>
                )}

                {description && (
                  <div className="rounded-md border border-border/60 bg-background/60 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ghi chú của bạn</p>
                    <p className="mt-1 text-sm leading-6 text-foreground/85">{description}</p>
                  </div>
                )}

                {resolutionMessage && (
                  <div className="rounded-md border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-sm leading-6 text-foreground/85">
                    {resolutionMessage}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 md:min-w-36 md:flex-col md:items-end md:justify-start">
          <Badge
            variant="outline"
            className={cn("rounded-md border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide", statusClassNames[report.status])}
          >
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
    <div className="grid gap-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="rounded-md border border-border/70 bg-card px-4 py-4 shadow-sm">
          <div className="flex gap-3">
            <div className="size-10 shrink-0 animate-pulse rounded-md bg-muted" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-56 max-w-full animate-pulse rounded bg-muted" />
              <div className="h-3 w-72 max-w-full animate-pulse rounded bg-muted" />
              <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ embedded = false, onRefresh }: { embedded?: boolean; onRefresh: () => void }) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center rounded-md border border-border/70 bg-card px-6 py-12 text-center shadow-sm">
      <div className="mb-3 flex size-11 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Inbox className="size-5" />
      </div>
      <h3 className="text-sm font-semibold text-foreground">Chưa có báo cáo nào</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Các báo cáo bạn đã gửi sẽ xuất hiện tại đây cùng trạng thái xử lý.
      </p>
      {!embedded && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRefresh}>
          <RefreshCw className="size-4" />
          Làm mới
        </Button>
      )}
    </div>
  );
}

function ReportSummaryPanel({ reports, refreshing, onRefresh }: { reports: MyReport[]; refreshing: boolean; onRefresh: () => void }) {
  const stats = useMemo(() => getReportStats(reports), [reports]);
  const latestReport = reports[0];

  return (
    <aside className="grid gap-3 xl:sticky xl:top-6 xl:self-start">
      <section className="rounded-md border border-border/70 bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tổng quan</p>
            <h2 className="mt-1 text-2xl font-semibold text-foreground">{stats.total}</h2>
          </div>
          <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Flag className="size-5" />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <StatTile label="Đang chờ" value={stats.pending + stats.reviewing} icon={<Clock3 className="size-4" />} />
          <StatTile label="Đã xử lý" value={stats.resolved} icon={<CheckCircle2 className="size-4" />} />
          <StatTile label="Tin nhắn" value={stats.message} icon={<MessageSquare className="size-4" />} />
          <StatTile label="Người dùng" value={stats.user} icon={<UserRound className="size-4" />} />
        </div>
      </section>

      <section className="rounded-md border border-border/70 bg-card p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gần nhất</p>
        {latestReport ? (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={cn("rounded-md", statusClassNames[latestReport.status])}>
                {statusLabels[latestReport.status]}
              </Badge>
              <span className="text-xs text-muted-foreground">{formatReportTime(latestReport.createdAt)}</span>
            </div>
            <p className="text-sm font-medium text-foreground">
              {latestReport.targetType === "message" ? "Báo cáo tin nhắn" : "Báo cáo người dùng"}
            </p>
            <p className="line-clamp-2 text-sm text-muted-foreground">{getTargetName(latestReport)}</p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Chưa có dữ liệu.</p>
        )}
      </section>

      <Button variant="outline" className="w-full justify-center" disabled={refreshing} onClick={onRefresh}>
        {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        Làm mới danh sách
      </Button>
    </aside>
  );
}

function StatTile({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/25 p-3">
      <div className="flex items-center justify-between gap-2 text-muted-foreground">
        <span className="text-xs">{label}</span>
        {icon}
      </div>
      <p className="mt-2 text-lg font-semibold text-foreground">{value}</p>
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
  const stats = useMemo(() => getReportStats(reports), [reports]);

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
        "flex h-full min-h-0 flex-col overflow-hidden bg-background",
        !embedded && "dark:bg-[#0b1426]"
      )}
    >
      <header className={cn("shrink-0 border-b border-border/70 bg-background/95 backdrop-blur", embedded ? "px-0 py-0" : "px-4 py-4 md:px-6")}>
        <div className={cn("mx-auto flex w-full items-center justify-between gap-3", embedded ? "max-w-none" : "max-w-7xl")}>
          <div className="flex min-w-0 items-center gap-3">
            {onBack && (
              <Button variant="ghost" size="icon" className="size-9 rounded-md" onClick={onBack}>
                <ArrowLeft className="size-4" />
              </Button>
            )}
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Flag className="size-5" />
            </div>
            <div className="min-w-0">
              <h1 className={cn("truncate font-semibold text-foreground", embedded ? "text-lg" : "text-xl md:text-2xl")}>
                Lịch sử báo cáo
              </h1>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                Theo dõi các báo cáo bạn đã gửi và trạng thái xử lý.
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-9 shrink-0"
            disabled={loading || refreshing}
            onClick={() => void loadReports("refresh")}
          >
            {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Làm mới
          </Button>
        </div>
      </header>

      <main className={cn("beautiful-scrollbar min-h-0 flex-1 overflow-y-auto", embedded ? "pt-4" : "p-4 md:p-6")}>
        <div className={cn("mx-auto w-full min-w-0", embedded ? "max-w-none" : "max-w-7xl")}>
          {!embedded && (
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <QuickMetric label="Báo cáo gần nhất" value={stats.total} />
              <QuickMetric label="Đang chờ xử lý" value={stats.pending + stats.reviewing} />
              <QuickMetric label="Đã có kết quả" value={stats.resolved + stats.dismissed} />
            </div>
          )}

          <div className={cn("grid gap-4", embedded ? "grid-cols-1" : "xl:grid-cols-[minmax(0,1fr)_320px]")}>
            <section className="min-w-0">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Danh sách báo cáo</h2>
                  <p className="text-xs text-muted-foreground">{reports.length} báo cáo gần nhất</p>
                </div>
                <Badge variant="outline" className="rounded-md">
                  {stats.pending + stats.reviewing > 0 ? `${stats.pending + stats.reviewing} đang xử lý` : "Không có báo cáo chờ"}
                </Badge>
              </div>

              {loading ? (
                <ReportSkeleton />
              ) : error ? (
                <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-md border border-border/70 bg-card px-6 py-12 text-center shadow-sm">
                  <XCircle className="size-8 text-destructive" />
                  <p className="text-sm text-muted-foreground">{error}</p>
                  <Button variant="outline" onClick={() => void loadReports("refresh")}>
                    Thử lại
                  </Button>
                </div>
              ) : reports.length > 0 ? (
                <div className="grid gap-3">
                  {reports.map((report, index) => (
                    <ReportCard key={report._id} report={report} index={index} embedded={embedded} />
                  ))}
                </div>
              ) : (
                <EmptyState embedded={embedded} onRefresh={() => void loadReports("refresh")} />
              )}
            </section>

            {!embedded && (
              <ReportSummaryPanel
                reports={reports}
                refreshing={refreshing}
                onRefresh={() => void loadReports("refresh")}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function QuickMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border/70 bg-card px-4 py-3 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

export default function ReportHistoryPage() {
  const navigate = useNavigate();

  return (
    <div className="relative flex h-full flex-1 overflow-hidden rounded-none border-0 bg-background md:rounded-r-2xl md:border-y md:border-r md:border-l-0 md:border-border/50">
      <ReportHistoryContent onBack={() => navigate(-1)} />
    </div>
  );
}
