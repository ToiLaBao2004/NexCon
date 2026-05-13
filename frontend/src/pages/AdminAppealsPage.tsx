import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, ShieldAlert, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { adminService, type AdminAppeal, type AdminUser } from "@/services/adminService";
import AdminUserDrawer from "@/components/admin/AdminUserDrawer";

const statusLabels: Record<AdminAppeal["status"] | "all", string> = {
  pending: "Đang chờ",
  approved: "Đã mở khóa",
  rejected: "Từ chối",
  all: "Tất cả",
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

function appealUser(appeal: AdminAppeal) {
  return typeof appeal.userId === "object" && appeal.userId ? appeal.userId as AdminUser : null;
}

export default function AdminAppealsPage() {
  const [appeals, setAppeals] = useState<AdminAppeal[]>([]);
  const [status, setStatus] = useState<AdminAppeal["status"] | "all">("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [drawerUserId, setDrawerUserId] = useState<string | null>(null);

  const selectedAppeal = useMemo(
    () => appeals.find((appeal) => appeal._id === selectedId) || appeals[0] || null,
    [appeals, selectedId]
  );

  const loadAppeals = async () => {
    try {
      setLoading(true);
      const result = await adminService.listAppeals(status);
      setAppeals(result.appeals);
      setSelectedId((current) => current && result.appeals.some((appeal) => appeal._id === current)
        ? current
        : result.appeals[0]?._id || null);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể tải kháng cáo");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAppeals();
  }, [status]);

  useEffect(() => {
    setNote(selectedAppeal?.adminNote || "");
  }, [selectedAppeal?._id]);

  const handleReview = async (action: "approve" | "reject") => {
    if (!selectedAppeal) return;
    try {
      setSubmitting(true);
      await adminService.reviewAppeal(selectedAppeal._id, action, note.trim());
      toast.success(action === "approve" ? "Đã chấp nhận kháng cáo và mở khóa" : "Đã từ chối kháng cáo");
      await loadAppeals();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể xử lý kháng cáo");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedUser = selectedAppeal ? appealUser(selectedAppeal) : null;
  const selectedUserId = selectedAppeal
    ? (typeof selectedAppeal.userId === "string" ? selectedAppeal.userId : selectedUser?._id || null)
    : null;
  const lockStatus = selectedUser?.lock?.isLocked
    ? "Đang khóa"
    : selectedAppeal?.status === "approved"
      ? "Đã mở khóa sau kháng cáo"
      : "Không khóa";

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b border-border/70 px-4 py-4 md:px-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-primary" />
              <h1 className="text-2xl font-semibold tracking-normal">Kháng cáo khóa tài khoản</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Chấp nhận kháng cáo sẽ mở khóa tài khoản và reset số lần vi phạm còn hiệu lực.
            </p>
          </div>
          <Button variant="outline" className="rounded-md" onClick={() => void loadAppeals()}>
            <RefreshCw className="size-4" />
            Làm mới
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {(["pending", "approved", "rejected", "all"] as const).map((item) => (
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
                Đang tải kháng cáo
              </div>
            ) : appeals.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Không có kháng cáo trong bộ lọc này.</div>
            ) : (
              appeals.map((appeal) => {
                const user = appealUser(appeal);
                return (
                  <button
                    key={appeal._id}
                    type="button"
                    onClick={() => setSelectedId(appeal._id)}
                    className={cn(
                      "w-full border-b border-border/60 px-4 py-3 text-left transition-colors hover:bg-muted/50",
                      selectedAppeal?._id === appeal._id && "bg-muted"
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate font-medium">{user?.displayName || appeal.email}</span>
                      <Badge variant={appeal.status === "rejected" ? "destructive" : "outline"}>
                        {statusLabels[appeal.status]}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-sm text-muted-foreground">{appeal.email}</p>
                    <p className="mt-2 line-clamp-2 text-sm">{appeal.reason}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{formatDate(appeal.createdAt)}</p>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className="beautiful-scrollbar min-h-0 overflow-y-auto p-4 md:p-5">
          {!selectedAppeal ? (
            <div className="flex min-h-60 items-center justify-center rounded-md border border-border/70 text-sm text-muted-foreground">
              Chọn một kháng cáo để xem xét.
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="rounded-md border border-border/70">
                <div className="border-b border-border/70 px-4 py-3 font-medium">Nội dung kháng cáo</div>
                <div className="grid gap-4 p-4 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Email</div>
                    {selectedUserId ? (
                      <button
                        type="button"
                        className="mt-1 break-all text-left font-medium text-primary underline-offset-4 hover:underline"
                        onClick={() => setDrawerUserId(selectedUserId)}
                      >
                        {selectedAppeal.email}
                      </button>
                    ) : (
                      <div className="mt-1 break-words font-medium">{selectedAppeal.email}</div>
                    )}
                  </div>
                  <Info label="User" value={selectedUser?.displayName || "Không có"} />
                  <Info label="Trạng thái tài khoản" value={lockStatus} />
                  {selectedUser?.lock?.isLocked && (
                    <Info label="Lý do khóa" value={selectedUser.lock.reason || "Không rõ"} />
                  )}
                  <Info label="Ngày gửi" value={formatDate(selectedAppeal.createdAt)} />
                  <div>
                    <div className="text-xs text-muted-foreground">Lý do kháng cáo</div>
                    <div className="mt-1 whitespace-pre-wrap rounded-md border border-border/70 bg-muted/30 p-3 font-medium">
                      {selectedAppeal.reason}
                    </div>
                  </div>
                  {selectedAppeal.adminNote && <Info label="Ghi chú admin" value={selectedAppeal.adminNote} />}
                </div>
              </div>

              <div className="rounded-md border border-border/70">
                <div className="border-b border-border/70 px-4 py-3 font-medium">Quyết định</div>
                <div className="space-y-3 p-4">
                  <Textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Ghi chú kết quả kháng cáo"
                    className="min-h-32 resize-none"
                    disabled={selectedAppeal.status !== "pending"}
                  />
                  <div className="grid gap-2">
                    <Button
                      className="rounded-md"
                      disabled={submitting || selectedAppeal.status !== "pending"}
                      onClick={() => void handleReview("approve")}
                    >
                      <CheckCircle2 className="size-4" />
                      Chấp nhận và mở khóa
                    </Button>
                    <Button
                      variant="destructive"
                      className="rounded-md"
                      disabled={submitting || selectedAppeal.status !== "pending"}
                      onClick={() => void handleReview("reject")}
                    >
                      <XCircle className="size-4" />
                      Từ chối kháng cáo
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
      <AdminUserDrawer
        userId={drawerUserId}
        open={Boolean(drawerUserId)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDrawerUserId(null);
        }}
        initialUser={selectedUserId === drawerUserId ? selectedUser : null}
        onChanged={() => void loadAppeals()}
      />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words font-medium">{value || "Không có"}</div>
    </div>
  );
}
