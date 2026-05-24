import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
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
      <div className="beautiful-scrollbar flex-1 overflow-y-auto p-5 md:p-7">
        <div className="mx-auto grid max-w-5xl gap-5">
          <header className="rounded-2xl border border-border/70 bg-card px-6 py-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-4">
                <Button size="sm" className="h-9 rounded-xl bg-primary px-4 font-medium text-primary-foreground hover:bg-primary/90" onClick={() => navigate("/chat")}>
                  Quay lại
                </Button>
                <div className="min-w-0">
                  <h1 className="text-[28px] font-bold leading-tight tracking-tight text-foreground">Trạng thái tiêu chuẩn cộng đồng</h1>
                  <p className="mt-1.5 text-sm leading-6 text-foreground">
                    Xem số lần vi phạm, lý do, thời gian ghi nhận và trạng thái xử lý của tài khoản.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                className="h-9 rounded-xl bg-primary px-4 font-medium text-primary-foreground hover:bg-primary/90"
                disabled={loading || refreshing}
                onClick={() => void loadStatus("refresh")}
              >
                {refreshing ? "Đang tải..." : "Làm mới"}
              </Button>
            </div>
          </header>

          {loading ? (
            <div className="flex min-h-72 items-center justify-center rounded-2xl border border-border/70 bg-card text-sm font-medium text-foreground">
              Đang tải...
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-4 text-sm font-medium text-destructive">
              {error}
            </div>
          ) : data ? (
            <>
              <section className="grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">Tổng quan vi phạm</h2>
                      <p className="mt-2 text-sm leading-6 text-foreground">
                        Đã ghi nhận {summary?.count ?? 0}/{summary?.threshold ?? 0} lần vi phạm còn hiệu lực.
                      </p>
                    </div>
                    <Badge variant={isLocked ? "destructive" : "outline"} className="rounded-full px-3 py-1">
                      {isLocked ? "Đang bị khóa" : "Đang hoạt động"}
                    </Badge>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Lần gần nhất</p>
                      <p className="mt-1 text-sm text-foreground">{formatModerationDate(summary?.lastViolationAt)}</p>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Giảm hiệu lực tiếp theo</p>
                      <p className="mt-1 text-sm text-foreground">{formatModerationDate(summary?.nextDecayAt)}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
                  <h2 className="text-lg font-semibold text-foreground">Hạn chế hiện tại</h2>
                  {isLocked ? (
                    <div className="mt-3 space-y-2 text-sm text-foreground">
                      <p className="font-medium text-destructive">{restriction?.reason}</p>
                      <p className="leading-6 text-foreground">
                        {restriction?.blockedUntil
                          ? `Bị khóa đến ${formatModerationDate(restriction.blockedUntil)}`
                          : "Không thời hạn, đến khi admin mở khóa hoặc chấp nhận khiếu nại."}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm leading-6 text-foreground">
                      Tài khoản chưa bị hạn chế. Tin nhắn chỉ bị chặn khi AI xác định rõ nội dung vi phạm.
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button asChild size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
                      <Link to="/community-standards" state={{ from: "/moderation" }}>Xem tiêu chuẩn</Link>
                    </Button>
                    <Button asChild size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
                      <Link to="/reports/my">Lịch sử báo cáo</Link>
                    </Button>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
                <h2 className="mb-4 text-lg font-semibold text-foreground">Lịch sử vi phạm</h2>
                <ViolationHistoryList items={data.history} />
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
