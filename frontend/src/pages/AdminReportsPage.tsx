import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { CheckCircle2, Loader2, MessageSquareWarning, RefreshCw, UserRoundX, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  adminService,
  type AdminReport,
} from "@/services/adminService";
import type { ReportStatus, ReportTargetType } from "@/services/reportService";

const statusOptions: Array<ReportStatus | "all"> = ["pending", "reviewing", "resolved", "dismissed", "all"];

const statusLabels: Record<ReportStatus | "all", string> = {
  pending: "Đang chờ",
  reviewing: "Đang xem",
  resolved: "Vi phạm",
  dismissed: "Không vi phạm",
  all: "Tất cả",
};

const reasonLabels: Record<string, string> = {
  spam: "Spam",
  harassment: "Quấy rối",
  hate_speech: "Thù ghét",
  sexual_content: "Nhạy cảm",
  violence: "Bạo lực",
  scam: "Lừa đảo",
  impersonation: "Giả mạo",
  self_harm: "Tự gây hại",
  other: "Khác",
};

function formatDate(value?: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getReportTitle(report: AdminReport) {
  if (report.targetType === "message") return "Báo cáo tin nhắn";
  return "Báo cáo người dùng";
}

function getPreview(report: AdminReport) {
  if (report.targetType === "user") return report.description || "Không có mô tả thêm";
  if (report.messageSnapshot?.type === "image") return "[Hình ảnh]";
  if (report.messageSnapshot?.type === "file") return report.messageSnapshot.fileName || "[File]";
  if (report.messageSnapshot?.type === "audio") return "[Tin nhắn thoại]";
  return report.messageSnapshot?.content || report.description || "[Tin nhắn]";
}

export default function AdminReportsPage({ targetType }: { targetType: ReportTargetType }) {
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [status, setStatus] = useState<ReportStatus | "all">("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [note, setNote] = useState("");

  const selectedReport = useMemo(
    () => reports.find((report) => report._id === selectedId) || reports[0] || null,
    [reports, selectedId]
  );

  const isMessagePage = targetType === "message";

  const loadReports = async () => {
    try {
      setLoading(true);
      const result = await adminService.listReports({ targetType, status });
      setReports(result.reports);
      setSelectedId((current) => current && result.reports.some((report) => report._id === current)
        ? current
        : result.reports[0]?._id || null);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể tải danh sách báo cáo");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadReports();
  }, [targetType, status]);

  useEffect(() => {
    setNote(selectedReport?.review?.note || "");
  }, [selectedReport?._id]);

  const handleReviewing = async () => {
    if (!selectedReport) return;
    await adminService.markReportReviewing(selectedReport._id);
    toast.success("Đã chuyển sang trạng thái đang xem xét");
    await loadReports();
  };

  const handleResolve = async (decision: "violation" | "no_violation") => {
    if (!selectedReport) return;
    try {
      setSubmitting(true);
      await adminService.resolveReport(selectedReport._id, decision, note.trim());
      toast.success(decision === "violation" ? "Đã xác nhận vi phạm" : "Đã đóng báo cáo không vi phạm");
      await loadReports();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể xử lý báo cáo");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b border-border/70 px-4 py-4 md:px-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              {isMessagePage ? <MessageSquareWarning className="size-5 text-destructive" /> : <UserRoundX className="size-5 text-destructive" />}
              <h1 className="text-2xl font-semibold tracking-normal">
                {isMessagePage ? "Giải quyết báo cáo tin nhắn" : "Giải quyết báo cáo người dùng"}
              </h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Xác nhận vi phạm sẽ thông báo cho người báo cáo, người bị báo cáo và tăng số lần vi phạm.
            </p>
          </div>
          <Button variant="outline" className="rounded-md" onClick={() => void loadReports()}>
            <RefreshCw className="size-4" />
            Làm mới
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {statusOptions.map((item) => (
            <Button
              key={item}
              variant={status === item ? "default" : "outline"}
              size="sm"
              className="h-8 rounded-md"
              onClick={() => setStatus(item)}
            >
              {statusLabels[item]}
            </Button>
          ))}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[420px_minmax(0,1fr)]">
        <aside className="min-h-0 border-b border-border/70 lg:border-b-0 lg:border-r">
          <div className="beautiful-scrollbar h-[34vh] overflow-y-auto lg:h-full">
            {loading ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" />
                Đang tải báo cáo
              </div>
            ) : reports.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Không có báo cáo trong bộ lọc này.</div>
            ) : (
              reports.map((report) => (
                <button
                  key={report._id}
                  type="button"
                  onClick={() => setSelectedId(report._id)}
                  className={cn(
                    "w-full border-b border-border/60 px-4 py-3 text-left transition-colors hover:bg-muted/50",
                    selectedReport?._id === report._id && "bg-muted"
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{getReportTitle(report)}</span>
                    <Badge variant={report.status === "resolved" ? "destructive" : "outline"}>
                      {statusLabels[report.status]}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {report.targetUserSnapshot?.displayName || report.targetUserSnapshot?.email || "Target user"}
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm">{getPreview(report)}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>{reasonLabels[report.reasonCategory] || report.reasonCategory}</span>
                    <span>{formatDate(report.createdAt)}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="beautiful-scrollbar min-h-0 overflow-y-auto p-4 md:p-5">
          {!selectedReport ? (
            <div className="flex min-h-60 items-center justify-center rounded-md border border-border/70 text-sm text-muted-foreground">
              Chọn một báo cáo để xử lý.
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="space-y-4">
                <DetailBlock title="Thông tin báo cáo">
                  <Info label="Người báo cáo" value={`${selectedReport.reporterSnapshot?.displayName || ""} ${selectedReport.reporterSnapshot?.email || ""}`.trim()} />
                  <Info label="Người bị báo cáo" value={`${selectedReport.targetUserSnapshot?.displayName || ""} ${selectedReport.targetUserSnapshot?.email || ""}`.trim()} />
                  <Info label="Lý do" value={reasonLabels[selectedReport.reasonCategory] || selectedReport.reasonCategory} />
                  <Info label="Mô tả" value={selectedReport.description || "Không có"} />
                </DetailBlock>

                <DetailBlock title={isMessagePage ? "Snapshot tin nhắn" : "Bằng chứng người dùng"}>
                  <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-sm">
                    {getPreview(selectedReport)}
                  </div>
                  {selectedReport.messageSnapshot?.mimeType && (
                    <p className="text-sm text-muted-foreground">MIME: {selectedReport.messageSnapshot.mimeType}</p>
                  )}
                </DetailBlock>

                {selectedReport.resolution?.decision && (
                  <DetailBlock title="Kết quả đã xử lý">
                    <Info label="Quyết định" value={selectedReport.resolution.decision === "violation" ? "Vi phạm" : "Không vi phạm"} />
                    <Info label="Biện pháp" value={selectedReport.resolution.actionTaken || "Không có"} />
                    <Info label="Ghi chú" value={selectedReport.review?.note || "Không có"} />
                  </DetailBlock>
                )}
              </div>

              <div className="rounded-md border border-border/70">
                <div className="border-b border-border/70 px-4 py-3 font-medium">Quyết định admin</div>
                <div className="space-y-3 p-4">
                  <Textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Ghi chú nội bộ hoặc lý do xử lý"
                    className="min-h-32 resize-none"
                    disabled={["resolved", "dismissed"].includes(selectedReport.status)}
                  />
                  <div className="grid gap-2">
                    <Button
                      variant="outline"
                      className="rounded-md"
                      disabled={submitting || ["resolved", "dismissed"].includes(selectedReport.status)}
                      onClick={() => void handleReviewing()}
                    >
                      Đánh dấu đang xem xét
                    </Button>
                    <Button
                      variant="destructive"
                      className="rounded-md"
                      disabled={submitting || ["resolved", "dismissed"].includes(selectedReport.status)}
                      onClick={() => void handleResolve("violation")}
                    >
                      <CheckCircle2 className="size-4" />
                      Xác nhận vi phạm
                    </Button>
                    <Button
                      variant="secondary"
                      className="rounded-md"
                      disabled={submitting || ["resolved", "dismissed"].includes(selectedReport.status)}
                      onClick={() => void handleResolve("no_violation")}
                    >
                      <XCircle className="size-4" />
                      Không vi phạm
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function DetailBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-border/70">
      <div className="border-b border-border/70 px-4 py-3 font-medium">{title}</div>
      <div className="grid gap-3 p-4">{children}</div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words font-medium">{value || "Không có"}</div>
    </div>
  );
}
