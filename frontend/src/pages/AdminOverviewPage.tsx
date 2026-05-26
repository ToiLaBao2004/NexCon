import { useEffect, useMemo, useState, type ReactNode, type UIEvent } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2, RefreshCw, Search, ShieldAlert, Users } from "lucide-react";
import { toast } from "sonner";
import AdminUserDrawer from "@/components/admin/AdminUserDrawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAvatarSrc } from "@/lib/avatar";
import { cn } from "@/lib/utils";
import { adminService, type AdminSortDir, type AdminStats, type AdminUser, type AdminUserSortBy, type Pagination } from "@/services/adminService";
import { getApiErrorMessage } from "@/lib/apiMessage";

function formatDate(value?: string | null) {
  if (!value) return "Chưa có";
  return new Date(value).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(value?: string | null) {
  if (!value) return "Chưa có";
  return new Date(value).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function locked(user?: AdminUser | null) {
  return Boolean(user?.lock?.isLocked);
}

function userLabel(user: AdminUser) {
  return user.displayName || user.email;
}

function getDefaultSortDir(sortBy: AdminUserSortBy): AdminSortDir {
  return sortBy === "user" ? "asc" : "desc";
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
  const [sortBy, setSortBy] = useState<AdminUserSortBy>("createdAt");
  const [sortDir, setSortDir] = useState<AdminSortDir>("desc");

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

      const result = await adminService.listUsers({ search: query, page, limit: 20, sortBy, sortDir });
      setUsers((current) => (append ? [...current, ...result.users] : result.users));
      setPagination(result.pagination);
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, "Không thể tải danh sách người dùng"));
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
  }, [appliedSearch, sortBy, sortDir]);

  const handleSort = (nextSortBy: AdminUserSortBy) => {
    setSortBy((currentSortBy) => {
      if (currentSortBy !== nextSortBy) {
        setSortDir(getDefaultSortDir(nextSortBy));
        return nextSortBy;
      }

      setSortDir((currentDir) => (currentDir === "asc" ? "desc" : "asc"));
      return currentSortBy;
    });
  };

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
              Danh sách người dùng chỉ hiển thị thông tin tài khoản và kiểm duyệt cần thiết.
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
            <Button className="rounded-md bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => void refresh()}>
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
              <div className="hidden grid-cols-[minmax(260px,1.4fr)_170px_140px_170px_92px] gap-4 border-b border-border/70 bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground lg:grid">
                <SortHeader active={sortBy === "user"} dir={sortDir} onClick={() => handleSort("user")}>
                  Người dùng
                </SortHeader>
                <SortHeader active={sortBy === "openReports"} dir={sortDir} onClick={() => handleSort("openReports")}>
                  Report mở
                </SortHeader>
                <SortHeader active={sortBy === "createdAt"} dir={sortDir} onClick={() => handleSort("createdAt")}>
                  Tham gia
                </SortHeader>
                <SortHeader active={sortBy === "lastSeenAt"} dir={sortDir} onClick={() => handleSort("lastSeenAt")}>
                  Lần cuối truy cập
                </SortHeader>
                <span />
              </div>
              {users.map((user) => (
                  <div
                    key={user._id}
                    className="grid gap-3 border-b border-border/60 px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(260px,1.4fr)_170px_140px_170px_92px] lg:items-center"
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

                    <div className="text-sm text-muted-foreground">
                      <span className="mr-1 font-medium text-foreground lg:hidden">Tham gia:</span>
                      {formatDate(user.createdAt)}
                    </div>

                    <div className="text-sm text-muted-foreground">
                      <span className="mr-1 font-medium text-foreground lg:hidden">Lần cuối truy cập:</span>
                      {formatDateTime(user.lastSeenAt)}
                    </div>

                    <Button className="w-fit rounded-md" size="sm" onClick={() => setDrawerUserId(user._id)}>
                      Xem
                    </Button>
                  </div>
              ))}
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

function SortHeader({
  active,
  dir,
  onClick,
  children,
}: {
  active: boolean;
  dir: AdminSortDir;
  onClick: () => void;
  children: ReactNode;
}) {
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-w-0 items-center gap-1 text-left transition-colors hover:text-foreground",
        active && "text-foreground"
      )}
    >
      <span className="truncate">{children}</span>
      <Icon className={cn("size-3.5 shrink-0", !active && "opacity-50")} />
    </button>
  );
}
