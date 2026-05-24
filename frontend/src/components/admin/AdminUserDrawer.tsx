import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  Archive,
  CalendarDays,
  FileText,
  Images,
  LinkIcon,
  Loader2,
  Lock,
  Mail,
  Paperclip,
  Phone,
  RefreshCw,
  ShieldAlert,
  Unlock,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { getAvatarSrc } from "@/lib/avatar";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/lib/apiMessage";
import {
  adminService,
  type AdminAuditLog,
  type AdminConversation,
  type AdminMessage,
  type AdminReport,
  type AdminUser,
} from "@/services/adminService";
import AdminEvidencePreview from "@/components/admin/AdminEvidencePreview";

type DrawerTab = "profile" | "groups" | "assets" | "reports" | "audit";
type AssetType = "all" | "image" | "file" | "link" | "audio";

const tabs: Array<{ value: DrawerTab; label: string; icon: typeof Users }> = [
  { value: "profile", label: "Hồ sơ", icon: Users },
  { value: "groups", label: "Nhóm", icon: Users },
  { value: "assets", label: "Tài nguyên", icon: Archive },
  { value: "reports", label: "Report đã xử lý", icon: FileText },
  { value: "audit", label: "Audit", icon: Activity },
];

const assetTabs: Array<{ value: AssetType; label: string; icon: typeof Archive }> = [
  { value: "all", label: "Tất cả", icon: Archive },
  { value: "image", label: "Ảnh", icon: Images },
  { value: "file", label: "File", icon: Paperclip },
  { value: "link", label: "Link", icon: LinkIcon },
];

const statusLabels: Record<string, string> = {
  pending: "Đang chờ",
  reviewing: "Đang xem xét",
  resolved: "Vi phạm",
  dismissed: "Không vi phạm",
};

function formatDate(value?: string | null) {
  if (!value) return "Chưa có";
  return new Date(value).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function locked(user?: AdminUser | null) {
  return Boolean(user?.lock?.isLocked);
}

function displayName(user?: AdminUser | null) {
  return user?.displayName || user?.email || "Người dùng";
}

function assetCounts(user?: AdminUser | null) {
  return user?.assetCounts || user?.counters?.assets || { image: 0, file: 0, link: 0, audio: 0, total: 0 };
}

export default function AdminUserDrawer({
  userId,
  open,
  onOpenChange,
  initialUser,
  onChanged,
}: {
  userId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialUser?: AdminUser | null;
  onChanged?: () => void | Promise<void>;
}) {
  const [user, setUser] = useState<AdminUser | null>(initialUser || null);
  const [activeTab, setActiveTab] = useState<DrawerTab>("profile");
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadingTab, setLoadingTab] = useState<DrawerTab | null>(null);
  const [groups, setGroups] = useState<AdminConversation[]>([]);
  const [assets, setAssets] = useState<AdminMessage[]>([]);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [loadedTabs, setLoadedTabs] = useState<Record<DrawerTab, boolean>>({
    profile: false,
    groups: false,
    assets: false,
    reports: false,
    audit: false,
  });
  const [assetType, setAssetType] = useState<AssetType>("all");
  const [manualReason, setManualReason] = useState("");

  const counts = useMemo(() => assetCounts(user), [user]);

  const loadProfile = async (id: string) => {
    try {
      setLoadingProfile(true);
      const result = await adminService.getUserProfile(id);
      setUser(result.user);
      setLoadedTabs((current) => ({ ...current, profile: true }));
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, "Không thể tải hồ sơ người dùng"));
    } finally {
      setLoadingProfile(false);
    }
  };

  const loadGroups = async (id: string) => {
    const result = await adminService.getUserConversations(id);
    setGroups(result.conversations);
  };

  const loadAssets = async (id: string, type: AssetType = assetType) => {
    const result = await adminService.getUserAssets(id, type);
    setAssets(result.assets);
  };

  const loadReports = async (id: string) => {
    const result = await adminService.getUserResolvedReports(id);
    setReports(result.reports);
  };

  const loadAudit = async (id: string) => {
    const result = await adminService.getUserAuditLogs(id);
    setAuditLogs(result.logs);
  };

  const loadTab = async (tab: DrawerTab, force = false) => {
    if (!userId || tab === "profile") return;
    if (loadedTabs[tab] && !force) return;

    try {
      setLoadingTab(tab);
      if (tab === "groups") await loadGroups(userId);
      if (tab === "assets") await loadAssets(userId);
      if (tab === "reports") await loadReports(userId);
      if (tab === "audit") await loadAudit(userId);
      setLoadedTabs((current) => ({ ...current, [tab]: true }));
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, "Không thể tải dữ liệu"));
    } finally {
      setLoadingTab(null);
    }
  };

  useEffect(() => {
    if (!open || !userId) return;

    setUser(initialUser || null);
    setActiveTab("profile");
    setGroups([]);
    setAssets([]);
    setReports([]);
    setAuditLogs([]);
    setAssetType("all");
    setManualReason("");
    setLoadedTabs({ profile: false, groups: false, assets: false, reports: false, audit: false });
    void loadProfile(userId);
  }, [open, userId]);

  const handleTabClick = (tab: DrawerTab) => {
    setActiveTab(tab);
    void loadTab(tab);
  };

  const refreshCurrent = async () => {
    if (!userId) return;
    await loadProfile(userId);
    if (activeTab !== "profile") {
      await loadTab(activeTab, true);
    }
    await onChanged?.();
  };

  const handleManualViolation = async () => {
    if (!userId || !manualReason.trim()) return;
    await adminService.addUserViolation(userId, manualReason.trim());
    toast.success("Đã ghi nhận vi phạm");
    setManualReason("");
    await refreshCurrent();
  };

  const handleLockToggle = async () => {
    if (!userId) return;
    if (locked(user)) {
      await adminService.unlockUser(userId, "Tài khoản đã được mở khóa sau khi xem xét.", true);
      toast.success("Đã mở khóa tài khoản");
    } else {
      await adminService.lockUser(userId, manualReason.trim() || "Tài khoản đã bị khóa.");
      toast.success("Đã khóa tài khoản");
    }
    await refreshCurrent();
  };

  const handleAssetType = async (type: AssetType) => {
    if (!userId) return;
    setAssetType(type);
    try {
      setLoadingTab("assets");
      const result = await adminService.getUserAssets(userId, type);
      setAssets(result.assets);
      setLoadedTabs((current) => ({ ...current, assets: true }));
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, "Không thể tải tài nguyên"));
    } finally {
      setLoadingTab(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-none md:w-[760px] xl:w-[920px]">
        <SheetHeader className="border-b border-border/70 px-5 py-4">
          <div className="flex items-start justify-between gap-4 pr-8">
            <div className="min-w-0">
              <SheetTitle className="truncate text-xl">{displayName(user)}</SheetTitle>
              <SheetDescription className="mt-1 flex flex-wrap items-center gap-2">
                <span className="inline-flex min-w-0 items-center gap-1">
                  <Mail className="size-3.5" />
                  <span className="truncate">{user?.email || "Đang tải email"}</span>
                </span>
                {user?.online && <Badge>Online</Badge>}
                {locked(user) && <Badge variant="destructive">Đang khóa</Badge>}
              </SheetDescription>
            </div>
            <Button variant="outline" size="icon-sm" className="rounded-md" onClick={() => void refreshCurrent()}>
              {loadingProfile ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            </Button>
          </div>
        </SheetHeader>

        <div className="border-b border-border/70 px-4 py-3">
          <div className="flex gap-2 overflow-x-auto beautiful-scrollbar">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <Button
                  key={tab.value}
                  type="button"
                  variant={activeTab === tab.value ? "default" : "outline"}
                  size="sm"
                  className="h-8 shrink-0 rounded-md"
                  onClick={() => handleTabClick(tab.value)}
                >
                  <Icon className="size-4" />
                  {tab.label}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="beautiful-scrollbar min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
          {loadingProfile && !user ? (
            <Loading text="Đang tải hồ sơ" />
          ) : !user ? (
            <Empty text="Không có dữ liệu người dùng." />
          ) : (
            <>
              {activeTab === "profile" && (
                <ProfileTab
                  user={user}
                  counts={counts}
                  manualReason={manualReason}
                  onManualReasonChange={setManualReason}
                  onManualViolation={() => void handleManualViolation()}
                  onLockToggle={() => void handleLockToggle()}
                />
              )}
              {activeTab === "groups" && (
                <TabBody loading={loadingTab === "groups"}>
                  <GroupsTab groups={groups} />
                </TabBody>
              )}
              {activeTab === "assets" && (
                <TabBody loading={loadingTab === "assets"}>
                  <AssetsTab
                    assets={assets}
                    activeType={assetType}
                    onTypeChange={(type) => void handleAssetType(type)}
                  />
                </TabBody>
              )}
              {activeTab === "reports" && (
                <TabBody loading={loadingTab === "reports"}>
                  <ReportsTab reports={reports} />
                </TabBody>
              )}
              {activeTab === "audit" && (
                <TabBody loading={loadingTab === "audit"}>
                  <AuditTab logs={auditLogs} />
                </TabBody>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ProfileTab({
  user,
  counts,
  manualReason,
  onManualReasonChange,
  onManualViolation,
  onLockToggle,
}: {
  user: AdminUser;
  counts: ReturnType<typeof assetCounts>;
  manualReason: string;
  onManualReasonChange: (value: string) => void;
  onManualViolation: () => void;
  onLockToggle: () => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <section className="rounded-md border border-border/70">
          <div className="border-b border-border/70 px-4 py-3 font-medium">Thông tin tài khoản</div>
          <div className="grid gap-4 p-4 text-sm lg:grid-cols-[180px_minmax(0,1fr)]">
            <div className="rounded-md border border-border/70 bg-muted/20 p-3">
              <div className="text-xs text-muted-foreground">Ảnh đại diện</div>
              <div className="mt-3 aspect-square overflow-hidden rounded-md bg-muted">
                <img src={getAvatarSrc(user.avatarUrl)} alt={user.displayName || user.email} className="h-full w-full object-cover" />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Info label="Email" value={user.email} icon={Mail} />
              <Info label="Tên hiển thị" value={user.displayName || "Chưa cập nhật"} />
              <Info label="Số điện thoại" value={user.phone || "Chưa cập nhật"} icon={Phone} />
              <Info label="Ngày tạo" value={formatDate(user.createdAt)} icon={CalendarDays} />
              <Info label="Bio" value={user.bio || "Chưa cập nhật"} className="md:col-span-2" />
            </div>
          </div>
        </section>

        <section className="rounded-md border border-border/70">
          <div className="border-b border-border/70 px-4 py-3 font-medium">Tóm tắt kiểm duyệt</div>
          <div className="grid gap-3 p-4 md:grid-cols-4">
            <Metric label="Ảnh" value={counts.image} />
            <Metric label="File" value={counts.file} />
            <Metric label="Link" value={counts.link} />
            <Metric label="Report mở" value={user.openReportCount || 0} />
          </div>
          <div className="grid gap-4 border-t border-border/70 p-4 text-sm md:grid-cols-2">
            <Info label="Trạng thái khóa" value={locked(user) ? user.lock?.reason || "Đang khóa" : "Bình thường"} />
            <Info label="Vi phạm hiệu lực" value={`${user.violationSummary?.count ?? user.moderation?.violationCountCache ?? 0}/${user.violationSummary?.threshold ?? 5}`} />
            <Info label="Lần vi phạm gần nhất" value={formatDate(user.moderation?.lastViolationAt)} />
            <Info label="Report đã xử lý còn lưu" value={user.counters?.resolvedReports ?? 0} />
          </div>
        </section>
      </div>

      <section className="rounded-md border border-border/70">
        <div className="border-b border-border/70 px-4 py-3 font-medium">Thao tác</div>
        <div className="space-y-3 p-4">
          <Textarea
            value={manualReason}
            onChange={(event) => onManualReasonChange(event.target.value)}
            placeholder="Ghi chú nội bộ cho thao tác kiểm duyệt"
            className="min-h-24 resize-none"
          />
          <Button className="w-full rounded-md" disabled={!manualReason.trim()} onClick={onManualViolation}>
            <ShieldAlert className="size-4" />
            Ghi nhận vi phạm
          </Button>
          <Button variant={locked(user) ? "outline" : "destructive"} className="w-full rounded-md" onClick={onLockToggle}>
            {locked(user) ? <Unlock className="size-4" /> : <Lock className="size-4" />}
            {locked(user) ? "Mở khóa tài khoản" : "Khóa tài khoản"}
          </Button>
        </div>
      </section>
    </div>
  );
}

function GroupsTab({ groups }: { groups: AdminConversation[] }) {
  if (groups.length === 0) return <Empty text="Người dùng chưa tham gia nhóm nào." />;

  return (
    <div className="overflow-hidden rounded-md border border-border/70">
      <div className="grid grid-cols-[minmax(180px,1fr)_110px_170px_100px_92px] gap-3 border-b border-border/70 bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
        <span>Nhóm</span>
        <span>Thành viên</span>
        <span>Tham gia</span>
        <span>Role</span>
        <span />
      </div>
      {groups.map((group) => (
        <div
          key={group._id}
          className="grid grid-cols-1 gap-3 border-b border-border/60 px-4 py-3 text-sm last:border-b-0 md:grid-cols-[minmax(180px,1fr)_110px_170px_100px_92px] md:items-center"
        >
          <div className="min-w-0">
            <div className="truncate font-medium">{group.group?.name || "Nhóm chưa đặt tên"}</div>
            {group.disbanded && <Badge variant="destructive" className="mt-1">Đã giải tán</Badge>}
          </div>
          <span className="text-muted-foreground">{group.participantCount} thành viên</span>
          <span className="text-muted-foreground">{formatDate(group.joinedAt)}</span>
          <Badge variant={group.role === "admin" ? "default" : "outline"} className="w-fit">
            {group.role === "admin" ? "admin" : "member"}
          </Badge>
          <Button variant="outline" size="sm" className="h-8 rounded-md" disabled>
            Xem nhóm
          </Button>
        </div>
      ))}
    </div>
  );
}

function AssetsTab({
  assets,
  activeType,
  onTypeChange,
}: {
  assets: AdminMessage[];
  activeType: AssetType;
  onTypeChange: (type: AssetType) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {assetTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Button
              key={tab.value}
              type="button"
              variant={activeType === tab.value ? "default" : "outline"}
              size="sm"
              className="h-8 rounded-md"
              onClick={() => onTypeChange(tab.value)}
            >
              <Icon className="size-4" />
              {tab.label}
            </Button>
          );
        })}
      </div>
      {assets.length === 0 ? (
        <Empty text="Chưa có tài nguyên trong bộ lọc này." />
      ) : (
        <div className="grid gap-3">
          {assets.map((asset) => (
            <AdminEvidencePreview key={asset._id} message={asset} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReportsTab({ reports }: { reports: AdminReport[] }) {
  if (reports.length === 0) return <Empty text="Chưa có báo cáo đã xử lý còn lưu cho người dùng này." />;

  return (
    <div className="space-y-3">
      {reports.map((report) => (
        <section key={report._id} className="rounded-md border border-border/70">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={report.status === "resolved" ? "destructive" : "outline"}>
                {statusLabels[report.status] || report.status}
              </Badge>
              <span className="text-sm font-medium">{report.targetType === "message" ? "Báo cáo tin nhắn" : "Báo cáo người dùng"}</span>
            </div>
            <span className="text-xs text-muted-foreground">{formatDate(report.review?.reviewedAt || report.updatedAt)}</span>
          </div>
          <div className="grid gap-3 p-4">
            <Info label="Người báo cáo" value={report.reporterSnapshot?.email || "Không có"} />
            <Info label="Biện pháp" value={report.resolution?.actionTaken || "Không có"} />
            {report.targetType === "message" && (
              <AdminEvidencePreview
                message={report.messageEvidence}
                fallbackText={report.messageSnapshot?.content || report.messageSnapshot?.fileName || "Không có snapshot tin nhắn."}
              />
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

function AuditTab({ logs }: { logs: AdminAuditLog[] }) {
  if (logs.length === 0) return <Empty text="Chưa có audit API." />;

  return (
    <div className="overflow-hidden rounded-md border border-border/70">
      {logs.map((log) => (
        <div
          key={log._id}
          className="grid gap-2 border-b border-border/60 px-4 py-3 text-sm last:border-b-0 md:grid-cols-[90px_minmax(0,1fr)_90px_160px]"
        >
          <span className="font-medium">{log.method}</span>
          <span className="min-w-0 truncate text-muted-foreground">{log.path}</span>
          <Badge variant={log.statusCode >= 400 ? "destructive" : "outline"} className="w-fit">
            {log.statusCode}
          </Badge>
          <span className="text-xs text-muted-foreground">{formatDate(log.createdAt)}</span>
        </div>
      ))}
    </div>
  );
}

function TabBody({ loading, children }: { loading: boolean; children: ReactNode }) {
  if (loading) return <Loading text="Đang tải dữ liệu" />;
  return <>{children}</>;
}

function Info({
  label,
  value,
  icon: Icon,
  className,
}: {
  label: string;
  value: string | number;
  icon?: typeof Mail;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {Icon && <Icon className="size-3.5" />}
        {label}
      </div>
      <div className="mt-1 break-words font-medium">{value || "Không có"}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border/70 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function Loading({ text }: { text: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
      <Loader2 className="mr-2 size-4 animate-spin" />
      {text}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-md border border-border/70 px-4 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
