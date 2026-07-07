import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Loader2, RefreshCw, Scale, XCircle } from "lucide-react";
import { toast } from "sonner";
import AdminEvidencePreview from "@/components/admin/AdminEvidencePreview";
import AdminIconButton from "@/components/admin/AdminIconButton";
import AdminUserDrawer from "@/components/admin/AdminUserDrawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/lib/apiMessage";
import { adminService, type AdminMessageAppeal, type AdminUser } from "@/services/adminService";

const statusLabels: Record<AdminMessageAppeal["status"] | "all", string> = {
  pending: "Đang chờ xử lý",
  approved: "Đã chấp nhận",
  rejected: "Đã từ chối",
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

function appealUser(appeal: AdminMessageAppeal) {
  return typeof appeal.requesterId === "object" && appeal.requesterId
    ? appeal.requesterId as AdminUser
    : null;
}

function statusVariant(status: AdminMessageAppeal["status"]) {
  if (status === "rejected") return "destructive";
  return "outline";
}

export default function AdminMessageAppealsPage() {
  const [appeals, setAppeals] = useState<AdminMessageAppeal[]>([]);
  const [status, setStatus] = useState<AdminMessageAppeal["status"] | "all">("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [drawerUserId, setDrawerUserId] = useState<string | null>(null);

  const selectedAppeal = useMemo(
    () => appeals.find((appeal) => appeal._id === selectedId) || appeals[0] || null,
    [appeals, selectedId]
  );
  const selectedUser = selectedAppeal ? appealUser(selectedAppeal) : null;
  const selectedUserId = selectedAppeal
    ? (typeof selectedAppeal.requesterId === "string" ? selectedAppeal.requesterId : selectedUser?._id || null)
    : null;

  const loadAppeals = async () => {
    try {
      setLoading(true);
      const result = await adminService.listMessageAppeals(status);
      setAppeals(result.appeals);
      setSelectedId((current) => current && result.appeals.some((appeal) => appeal._id === current)
        ? current
        : result.appeals[0]?._id || null);
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, "Không thể tải kháng cáo tin nhắn"));
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
      await adminService.reviewMessageAppeal(selectedAppeal._id, action, note.trim());
      toast.success(action === "approve" ? "Đã chấp nhận kháng cáo và khôi phục tin nhắn" : "Đã từ chối kháng cáo");
      await loadAppeals();
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, "Không thể xử lý kháng cáo"));
    } finally {
      setSubmitting(false);
    }
  };

  const completed = selectedAppeal ? selectedAppeal.status !== "pending" : true;
  const message = selectedAppeal?.message;
  const aiReason = message?.aiModeration?.reason || "Không có";

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b border-border/70 px-4 py-4 md:px-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Scale className="size-5 text-primary" />
              <h1 className="text-2xl font-semibold tracking-normal">Kháng cáo tin nhắn AI</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Xem lại các tin nhắn bị AI đánh dấu vi phạm và quyết định khôi phục hoặc giữ nguyên.
            </p>
          </div>
          <AdminIconButton label="Làm mới" className="rounded-md" onClick={() => void loadAppeals()}>
            <RefreshCw className="size-4" />
          </AdminIconButton>
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
              <Loading text="Đang tải kháng cáo" />
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
                      <span className="min-w-0 truncate font-medium">{user?.displayName || "Người gửi"}</span>
                      <Badge variant={statusVariant(appeal.status)}>
                        {statusLabels[appeal.status]}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-sm text-muted-foreground">{appeal.conversation?.title || "Hội thoại"}</p>
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
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-4">
                <DetailBlock title="Thông tin kháng cáo">
                  <div className="grid gap-4 md:grid-cols-2">
                    <UserInfoButton
                      label="Người gửi"
                      name={selectedUser?.displayName || "Không có"}
                      email={selectedUser?.email}
                      onClick={() => selectedUserId && setDrawerUserId(selectedUserId)}
                    />
                    <Info label="Hội thoại" value={selectedAppeal.conversation?.title || "Không có"} />
                    <Info label="Thời gian gửi" value={formatDate(selectedAppeal.createdAt)} />
                    <Info label="Trạng thái" value={statusLabels[selectedAppeal.status]} />
                  </div>
                  <Info label="Lý do AI đánh dấu" value={aiReason} />
                  <Info label="Lý do kháng cáo của người dùng" value={selectedAppeal.reason} />
                </DetailBlock>

                <DetailBlock title="Nội dung tin nhắn">
                  <Info label="Nội dung gốc" value={message?.originalContent || message?.content || "Không có"} />
                  <Info label="Nội dung đang hiển thị" value={message?.displayContent || "Không có"} />
                  <AdminEvidencePreview
                    message={message || null}
                    fallbackText={message?.originalContent || "Không có nội dung xem trước."}
                  />
                </DetailBlock>

                {selectedAppeal.reviewedAt && (
                  <DetailBlock title="Kết quả xử lý">
                    <Info label="Thời gian xử lý" value={formatDate(selectedAppeal.reviewedAt)} />
                    <Info label="Ghi chú admin" value={selectedAppeal.adminNote || "Không có"} />
                  </DetailBlock>
                )}
              </div>

              <div className="rounded-md border border-border/70">
                <div className="border-b border-border/70 px-4 py-3 font-medium">Quyết định admin</div>
                <div className="space-y-3 p-4">
                  <Textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Ghi chú cho người dùng hoặc nội bộ"
                    className="min-h-32 resize-none"
                    disabled={completed}
                  />
                  <div className="flex flex-wrap gap-2">
                    <AdminIconButton
                      label="Chấp nhận kháng cáo"
                      className="rounded-md"
                      disabled={submitting || completed}
                      onClick={() => void handleReview("approve")}
                    >
                      <CheckCircle2 className="size-4" />
                    </AdminIconButton>
                    <AdminIconButton
                      label="Từ chối kháng cáo"
                      variant="destructive"
                      className="rounded-md"
                      disabled={submitting || completed}
                      onClick={() => void handleReview("reject")}
                    >
                      <XCircle className="size-4" />
                    </AdminIconButton>
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

function DetailBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-border/70">
      <div className="border-b border-border/70 px-4 py-3 font-medium">{title}</div>
      <div className="grid gap-3 p-4">{children}</div>
    </section>
  );
}

function UserInfoButton({
  label,
  name,
  email,
  onClick,
}: {
  label: string;
  name: string;
  email?: string;
  onClick: () => void;
}) {
  return (
    <div className="text-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium">{name}</div>
      {email ? (
        <button
          type="button"
          className="mt-1 break-all text-left text-sm text-primary underline-offset-4 hover:underline"
          onClick={onClick}
        >
          {email}
        </button>
      ) : (
        <div className="mt-1 text-sm text-muted-foreground">Không có email</div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 whitespace-pre-wrap break-words font-medium">{value || "Không có"}</div>
    </div>
  );
}

function Loading({ text }: { text: string }) {
  return (
    <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
      <Loader2 className="mr-2 size-4 animate-spin" />
      {text}
    </div>
  );
}
