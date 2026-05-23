import { useEffect, useMemo, useState, type UIEvent } from "react";
import { Archive, FileText, Images, LinkIcon, Loader2, RefreshCw, Search, ShieldAlert, Users } from "lucide-react";
import { toast } from "sonner";
import AdminUserDrawer from "@/components/admin/AdminUserDrawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAvatarSrc } from "@/lib/avatar";
import { cn } from "@/lib/utils";
import { adminService, type AdminStats, type AdminUser, type Pagination } from "@/services/adminService";

function formatDate(value?: string | null) {
  if (!value) return "Chưa có";
  return new Date(value).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function locked(user?: AdminUser | null) {
  return Boolean(user?.lock?.isLocked);
}

function userLabel(user: AdminUser) {
  return user.displayName || user.email;
}

function counts(user: AdminUser) {
  return user.assetCounts || { image: 0, file: 0, link: 0, audio: 0, total: 0 };
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [drawerUserId, setDrawerUserId] = useState<string | null>(null);

  const drawerUser = useMemo(
    () => users.find((user) => user._id === drawerUserId) || null,
    [drawerUserId, users]
  );

  const hasMore = pagination ? pagination.page < pagination.totalPages : false;

  const loadStats = async () => {
    const result = await adminService.getStats();
    setStats(result.stats);
  };

  const loadUsers = async ({ page = 1, append = false, query = appliedSearch } = {}) => {
    try {
      if (append) setLoadingMore(true);
      else setLoadingUsers(true);

      const result = await adminService.listUsers({ search: query, page, limit: 20 });
      setUsers((current) => (append ? [...current, ...result.users] : result.users));
      setPagination(result.pagination);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể tải danh sách người dùng");
    } finally {
      setLoadingUsers(false);
      setLoadingMore(false);
    }
  };

  const refresh = async () => {
    await Promise.all([loadStats(), loadUsers({ page: 1, append: false })]);
  };

  useEffect(() => {
    void loadStats();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAppliedSearch(search.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    void loadUsers({ page: 1, append: false, query: appliedSearch });
  }, [appliedSearch]);

  const loadMore = async () => {
    if (!pagination || loadingMore || loadingUsers || !hasMore) return;
    await loadUsers({ page: pagination.page + 1, append: true });
  };

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    if (target.scrollTop + target.clientHeight >= target.scrollHeight - 240) {
      void loadMore();
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b border-border/70 px-4 py-4 md:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-primary" />
              <h1 className="text-2xl font-semibold tracking-normal">Tổng quan admin</h1>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Danh sách người dùng chỉ hiển thị thông tin tổng quan. Chi tiết, nhóm, file, ảnh và link được tải khi admin mở từng hồ sơ.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <Metric label="Users" value={stats?.totalUsers ?? 0} />
            <Metric label="Đang khóa" value={stats?.lockedUsers ?? 0} />
            <Metric label="Report tin" value={stats?.pendingMessageReports ?? 0} />
            <Metric label="Report user" value={stats?.pendingUserReports ?? 0} />
            <Metric label="Kháng cáo" value={stats?.pendingAppeals ?? 0} />
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-border/70 px-4 py-3 md:px-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full md:max-w-md">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm email, tên hoặc số điện thoại"
                className="h-10 pl-9"
              />
            </div>
            <Button variant="outline" className="rounded-md" onClick={() => void refresh()}>
              <RefreshCw className="size-4" />
              Làm mới
            </Button>
          </div>
        </div>

        <div className="beautiful-scrollbar min-h-0 flex-1 overflow-y-auto p-4 md:p-6" onScroll={handleScroll}>
          {loadingUsers ? (
            <div className="flex min-h-60 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Đang tải danh sách người dùng
            </div>
          ) : users.length === 0 ? (
            <div className="flex min-h-60 items-center justify-center rounded-md border border-border/70 text-sm text-muted-foreground">
              Không có người dùng phù hợp.
            </div>
          ) : (
            <div className="mx-auto w-full max-w-7xl overflow-hidden rounded-md border border-border/70">
              <div className="hidden grid-cols-[minmax(220px,1.2fr)_minmax(260px,1fr)_130px_120px_92px] gap-4 border-b border-border/70 bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground lg:grid">
                <span>Người dùng</span>
                <span>Tài nguyên</span>
                <span>Report mở</span>
                <span>Tham gia</span>
                <span />
              </div>
              {users.map((user) => {
                const c = counts(user);
                return (
                  <div
                    key={user._id}
                    className="grid gap-3 border-b border-border/60 px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(220px,1.2fr)_minmax(260px,1fr)_130px_120px_92px] lg:items-center"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="relative shrink-0">
                        <img src={getAvatarSrc(user.avatarUrl)} alt={userLabel(user)} className="size-10 rounded-full object-cover" />
                        <span
                          className={cn(
                            "absolute bottom-0 right-0 size-2.5 rounded-full ring-2 ring-background",
                            user.online ? "bg-emerald-500" : "bg-muted-foreground/35"
                          )}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="truncate font-medium">{userLabel(user)}</span>
                          {locked(user) && <Badge variant="destructive">Đang khóa</Badge>}
                        </div>
                        <div className="truncate text-sm text-muted-foreground">{user.email}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <AssetBadge icon={Images} label="ảnh" value={c.image} />
                      <AssetBadge icon={PaperclipIcon} label="file" value={c.file} />
                      <AssetBadge icon={LinkIcon} label="link" value={c.link} />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {(user.openReportCount || 0) > 0 ? (
                        <Badge variant="destructive">{user.openReportCount} report</Badge>
                      ) : (
                        <Badge variant="outline">0 report</Badge>
                      )}
                      <Badge variant="secondary">
                        {user.violationSummary?.count ?? user.moderation?.violationCountCache ?? 0}/{user.violationSummary?.threshold ?? 5}
                      </Badge>
                    </div>

                    <div className="text-sm text-muted-foreground">{formatDate(user.createdAt)}</div>

                    <Button className="w-fit rounded-md" size="sm" onClick={() => setDrawerUserId(user._id)}>
                      Xem
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {!loadingUsers && users.length > 0 && (
            <div className="flex justify-center py-4">
              {hasMore ? (
                <Button variant="outline" className="rounded-md" disabled={loadingMore} onClick={() => void loadMore()}>
                  {loadingMore ? <Loader2 className="size-4 animate-spin" /> : <Users className="size-4" />}
                  Tải thêm
                </Button>
              ) : (
                <span className="text-sm text-muted-foreground">Đã tải hết danh sách.</span>
              )}
            </div>
          )}
        </div>
      </div>

      <AdminUserDrawer
        userId={drawerUserId}
        open={Boolean(drawerUserId)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDrawerUserId(null);
        }}
        initialUser={drawerUser}
        onChanged={() => void refresh()}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-24 rounded-md border border-border/70 bg-background px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function AssetBadge({ icon: Icon, label, value }: { icon: typeof Archive; label: string; value: number }) {
  return (
    <Badge variant="outline" className="gap-1.5 rounded-md px-2.5 py-1">
      <Icon className="size-3.5" />
      {value} {label}
    </Badge>
  );
}

const PaperclipIcon = FileText;
