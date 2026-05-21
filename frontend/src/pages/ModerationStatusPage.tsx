import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { AlertTriangle, ArrowLeft, FileText, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { moderationService } from "@/services/moderationService";
import type { ModerationStatusResponse } from "@/types/moderation";
import { ViolationHistoryList } from "@/components/moderation/ViolationHistoryList";
import { formatModerationDate } from "@/lib/moderationNotice";

export default function ModerationStatusPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<ModerationStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = async (mode: "initial" | "refresh" = "initial") => {
    try {
      if (mode === "initial") setLoading(true);
      if (mode === "refresh") setRefreshing(true);
      setError(null);
      setData(await moderationService.getMyModerationStatus(50));
    } catch (err: any) {
      setError(err?.response?.data?.message || "Không thể tải lịch sử vi phạm.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  const summary = data?.summary;
  const restriction = data?.restriction;
  const isLocked = Boolean(restriction?.locked);

  return (
    <div className="relative flex h-full flex-1 overflow-hidden bg-background md:rounded-r-2xl md:border-y md:border-r md:border-l-0 md:border-border/50">
      <div className="beautiful-scrollbar flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto grid max-w-5xl gap-4">
          <header className="rounded-md border border-border/70 bg-card px-4 py-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <Button variant="ghost" size="icon" className="size-9 rounded-md" onClick={() => navigate("/chat")}>
                  <ArrowLeft className="size-4" />
                </Button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="size-5 text-primary" />
                    <h1 className="text-xl font-semibold tracking-tight">Trạng thái tiêu chuẩn cộng đồng</h1>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Xem số lần vi phạm, lý do, thời gian ghi nhận và trạng thái xử lý của tài khoản.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={loading || refreshing}
                onClick={() => void loadStatus("refresh")}
              >
                {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                Làm mới
              </Button>
            </div>
          </header>

          {loading ? (
            <div className="flex min-h-72 items-center justify-center rounded-md border border-border/70 bg-card">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-6 text-sm text-destructive">
              {error}
            </div>
          ) : data ? (
            <>
              <section className="grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-md border border-border/70 bg-card p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <AlertTriangle className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold">Tổng quan vi phạm</h2>
                        <Badge variant={isLocked ? "destructive" : "outline"} className="rounded-md">
                          {isLocked ? "Đang bị khóa" : "Đang hoạt động"}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Đã ghi nhận {summary?.count ?? 0}/{summary?.threshold ?? 0} lần vi phạm còn hiệu lực.
                      </p>
                      <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                        <span>Lần gần nhất: {formatModerationDate(summary?.lastViolationAt)}</span>
                        <span>Giảm hiệu lực tiếp theo: {formatModerationDate(summary?.nextDecayAt)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-md border border-border/70 bg-card p-4">
                  <h2 className="text-base font-semibold">Hạn chế hiện tại</h2>
                  {isLocked ? (
                    <div className="mt-3 space-y-2 text-sm">
                      <p className="font-medium text-destructive">{restriction?.reason}</p>
                      <p className="text-muted-foreground">
                        {restriction?.blockedUntil
                          ? `Bị khóa đến ${formatModerationDate(restriction.blockedUntil)}`
                          : "Không thời hạn, đến khi admin mở khóa hoặc chấp nhận khiếu nại."}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Tài khoản chưa bị hạn chế. Tin nhắn chỉ bị chặn khi AI xác định rõ nội dung vi phạm.
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link to="/community-standards" state={{ from: "/moderation" }}>Xem tiêu chuẩn</Link>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <Link to="/reports/my">Lịch sử báo cáo</Link>
                    </Button>
                  </div>
                </div>
              </section>

              <section className="rounded-md border border-border/70 bg-card p-4">
                <div className="mb-4 flex items-center gap-2">
                  <FileText className="size-5 text-primary" />
                  <h2 className="text-base font-semibold">Lịch sử vi phạm</h2>
                </div>
                <ViolationHistoryList items={data.history} />
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
