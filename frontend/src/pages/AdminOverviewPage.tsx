import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Archive,
  FileText,
  Loader2,
  Lock,
  MessageSquare,
  RefreshCw,
  Search,
  ShieldAlert,
  Unlock,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  adminService,
  type AdminAuditLog,
  type AdminConversation,
  type AdminMessage,
  type AdminStats,
  type AdminUser,
} from "@/services/adminService";

type EvidenceTab = "profile" | "conversations" | "audit" | "messages" | "assets";

const evidenceTabs: Array<{ value: EvidenceTab; label: string; icon: typeof Users }> = [
  { value: "profile", label: "Hồ sơ", icon: Users },
  { value: "conversations", label: "Nhóm / hội thoại", icon: MessageSquare },
  { value: "audit", label: "Audit API", icon: Activity },
  { value: "messages", label: "Tin nhắn", icon: FileText },
  { value: "assets", label: "File / ảnh / link", icon: Archive },
];

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

function userLabel(user: AdminUser) {
  return user.displayName || user.email;
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [activeTab, setActiveTab] = useState<EvidenceTab>("profile");
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingPanel, setLoadingPanel] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [conversations, setConversations] = useState<AdminConversation[]>([]);
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [assets, setAssets] = useState<AdminMessage[]>([]);
  const [manualReason, setManualReason] = useState("");

  const listSelectedUser = useMemo(
    () => users.find((user) => user._id === selectedId) || null,
    [selectedId, users]
  );
  const currentUser = selectedUser || listSelectedUser;

  const loadStats = async () => {
    const result = await adminService.getStats();
    setStats(result.stats);
  };

  const loadUsers = async () => {
    try {
      setLoadingUsers(true);
      const result = await adminService.listUsers({ search, limit: 50 });
      setUsers(result.users);
      if (!selectedId && result.users[0]) {
        setSelectedId(result.users[0]._id);
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể tải danh sách user");
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadSelectedProfile = async (userId: string) => {
    try {
      setLoadingPanel(true);
      const result = await adminService.getUserProfile(userId);
      setSelectedUser(result.user);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể tải hồ sơ user");
    } finally {
      setLoadingPanel(false);
    }
  };

  const loadEvidence = async (tab: EvidenceTab, userId: string) => {
    if (tab === "profile") {
      await loadSelectedProfile(userId);
      return;
    }

    try {
      setLoadingPanel(true);
      if (tab === "audit") {
        const result = await adminService.getUserAuditLogs(userId);
        setAuditLogs(result.logs);
      }
      if (tab === "conversations") {
        const result = await adminService.getUserConversations(userId);
        setConversations(result.conversations);
      }
      if (tab === "messages") {
        const result = await adminService.getUserMessages(userId);
        setMessages(result.messages);
      }
      if (tab === "assets") {
        const result = await adminService.getUserAssets(userId);
        setAssets(result.assets);
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể tải dữ liệu");
    } finally {
      setLoadingPanel(false);
    }
  };

  useEffect(() => {
    void loadStats();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadUsers();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!selectedId) return;
    setActiveTab("profile");
    setAuditLogs([]);
    setConversations([]);
    setMessages([]);
    setAssets([]);
    void loadSelectedProfile(selectedId);
  }, [selectedId]);

  const handleTabClick = (tab: EvidenceTab) => {
    setActiveTab(tab);
    if (selectedId) {
      void loadEvidence(tab, selectedId);
    }
  };

  const refreshCurrentUser = async () => {
    if (!selectedId) return;
    await Promise.all([loadUsers(), loadSelectedProfile(selectedId), loadStats()]);
  };

  const handleManualViolation = async () => {
    if (!selectedId || !manualReason.trim()) return;
    await adminService.addUserViolation(selectedId, manualReason.trim());
    toast.success("Đã ghi nhận vi phạm");
    setManualReason("");
    await refreshCurrentUser();
  };

  const handleLockToggle = async () => {
    if (!selectedId) return;
    if (locked(currentUser)) {
      await adminService.unlockUser(selectedId, "Admin mở khóa sau khi xem xét bằng chứng.", true);
      toast.success("Đã mở khóa tài khoản");
    } else {
      await adminService.lockUser(selectedId, manualReason.trim() || "Admin khóa tài khoản sau khi xem xét bằng chứng.");
      toast.success("Đã khóa tài khoản");
    }
    await refreshCurrentUser();
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b border-border/70 px-4 py-4 md:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">Tổng quan admin</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Chọn từng user để mở hồ sơ, hội thoại, audit API, tin nhắn và tài nguyên đã gửi.
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

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="min-h-0 border-b border-border/70 lg:border-b-0 lg:border-r">
          <div className="border-b border-border/70 p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm email, tên hoặc số điện thoại"
                className="h-10 pl-9"
              />
            </div>
          </div>

          <div className="beautiful-scrollbar h-[34vh] overflow-y-auto lg:h-full">
            {loadingUsers ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" />
                Đang tải user
              </div>
            ) : users.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Không có user phù hợp.</div>
            ) : (
              users.map((user) => (
                <button
                  key={user._id}
                  type="button"
                  onClick={() => setSelectedId(user._id)}
                  className={cn(
                    "flex w-full items-start gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors hover:bg-muted/50",
                    selectedId === user._id && "bg-muted"
                  )}
                >
                  <span className={cn("mt-1 size-2.5 rounded-full", user.online ? "bg-emerald-500" : "bg-muted-foreground/35")} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{userLabel(user)}</span>
                    <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
                    <span className="mt-2 flex flex-wrap gap-1">
                      {locked(user) && <Badge variant="destructive">Locked</Badge>}
                      {(user.openReportCount || 0) > 0 && <Badge variant="outline">{user.openReportCount} report</Badge>}
                      <Badge variant="secondary">{user.violationSummary?.count ?? user.moderation?.violationCountCache ?? 0}/{user.violationSummary?.threshold ?? 5}</Badge>
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="min-h-0 overflow-hidden">
          {!currentUser ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Chọn một user để xem dữ liệu.
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              <div className="shrink-0 border-b border-border/70 px-4 py-3 md:px-5">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-lg font-semibold">{userLabel(currentUser)}</h2>
                      <Badge variant={currentUser.online ? "default" : "outline"}>{currentUser.online ? "Online" : "Offline"}</Badge>
                      {locked(currentUser) && <Badge variant="destructive">Đang khóa</Badge>}
                    </div>
                    <p className="mt-1 truncate text-sm text-muted-foreground">{currentUser.email}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {evidenceTabs.map((tab) => {
                      const Icon = tab.icon;
                      return (
                        <Button
                          key={tab.value}
                          variant={activeTab === tab.value ? "default" : "outline"}
                          size="sm"
                          className="h-9 rounded-md"
                          onClick={() => handleTabClick(tab.value)}
                        >
                          <Icon className="size-4" />
                          {tab.label}
                        </Button>
                      );
                    })}
                    <Button variant="outline" size="sm" className="h-9 rounded-md" onClick={() => void refreshCurrentUser()}>
                      <RefreshCw className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="beautiful-scrollbar min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
                {loadingPanel ? (
                  <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Đang tải dữ liệu
                  </div>
                ) : (
                  <>
                    {activeTab === "profile" && (
                      <ProfilePanel
                        user={currentUser}
                        manualReason={manualReason}
                        onManualReasonChange={setManualReason}
                        onManualViolation={() => void handleManualViolation()}
                        onLockToggle={() => void handleLockToggle()}
                      />
                    )}
                    {activeTab === "conversations" && <ConversationsPanel conversations={conversations} />}
                    {activeTab === "audit" && <AuditPanel logs={auditLogs} />}
                    {activeTab === "messages" && <MessagesPanel messages={messages} />}
                    {activeTab === "assets" && <MessagesPanel messages={assets} assets />}
                  </>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
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

function ProfilePanel({
  user,
  manualReason,
  onManualReasonChange,
  onManualViolation,
  onLockToggle,
}: {
  user: AdminUser;
  manualReason: string;
  onManualReasonChange: (value: string) => void;
  onManualViolation: () => void;
  onLockToggle: () => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="rounded-md border border-border/70">
        <div className="border-b border-border/70 px-4 py-3 font-medium">Hồ sơ và trạng thái</div>
        <div className="grid gap-3 p-4 text-sm md:grid-cols-2">
          <Info label="Email" value={user.email} />
          <Info label="Tên hiển thị" value={user.displayName} />
          <Info label="Số điện thoại" value={user.phone || "Chưa cập nhật"} />
          <Info label="Ngày tạo" value={formatDate(user.createdAt)} />
          <Info label="Bio" value={user.bio || "Chưa cập nhật"} />
          <Info label="Trạng thái khóa" value={locked(user) ? user.lock?.reason || "Đang khóa" : "Bình thường"} />
          <Info label="Vi phạm hiệu lực" value={`${user.violationSummary?.count ?? user.moderation?.violationCountCache ?? 0}/${user.violationSummary?.threshold ?? 5}`} />
          <Info label="Lần vi phạm gần nhất" value={formatDate(user.moderation?.lastViolationAt)} />
        </div>
      </div>

      <div className="rounded-md border border-border/70">
        <div className="border-b border-border/70 px-4 py-3 font-medium">Thao tác kiểm duyệt</div>
        <div className="space-y-3 p-4">
          <Textarea
            value={manualReason}
            onChange={(event) => onManualReasonChange(event.target.value)}
            placeholder="Ghi chú lý do vi phạm hoặc khóa tài khoản"
            className="min-h-24 resize-none"
          />
          <div className="grid gap-2">
            <Button className="rounded-md" disabled={!manualReason.trim()} onClick={onManualViolation}>
              <ShieldAlert className="size-4" />
              Ghi nhận một lần vi phạm
            </Button>
            <Button variant={locked(user) ? "outline" : "destructive"} className="rounded-md" onClick={onLockToggle}>
              {locked(user) ? <Unlock className="size-4" /> : <Lock className="size-4" />}
              {locked(user) ? "Mở khóa tài khoản" : "Khóa tài khoản"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words font-medium">{value}</div>
    </div>
  );
}

function ConversationsPanel({ conversations }: { conversations: AdminConversation[] }) {
  if (conversations.length === 0) return <Empty text="User chưa có hội thoại." />;

  return (
    <div className="overflow-hidden rounded-md border border-border/70">
      {conversations.map((conversation) => (
        <div key={conversation._id} className="border-b border-border/60 px-4 py-3 last:border-b-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{conversation.type}</Badge>
            <span className="font-medium">
              {conversation.group?.name || (conversation.type === "direct" ? "Hội thoại trực tiếp" : "Nhóm chưa đặt tên")}
            </span>
            {conversation.disbanded && <Badge variant="destructive">Đã giải tán</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {conversation.participantCount} thành viên · Cập nhật {formatDate(conversation.updatedAt)}
          </p>
          <p className="mt-2 line-clamp-2 text-sm">{conversation.lastMessage?.content || conversation.lastMessage?.type || "Chưa có tin nhắn"}</p>
        </div>
      ))}
    </div>
  );
}

function AuditPanel({ logs }: { logs: AdminAuditLog[] }) {
  if (logs.length === 0) return <Empty text="Chưa có audit API." />;

  return (
    <div className="overflow-hidden rounded-md border border-border/70">
      {logs.map((log) => (
        <div key={log._id} className="grid gap-2 border-b border-border/60 px-4 py-3 text-sm last:border-b-0 md:grid-cols-[110px_minmax(0,1fr)_100px_160px]">
          <div className="font-medium">{log.method}</div>
          <div className="min-w-0 truncate text-muted-foreground">{log.path}</div>
          <Badge variant={log.statusCode >= 400 ? "destructive" : "outline"}>{log.statusCode}</Badge>
          <div className="text-xs text-muted-foreground">{formatDate(log.createdAt)}</div>
        </div>
      ))}
    </div>
  );
}

function MessagesPanel({ messages, assets = false }: { messages: AdminMessage[]; assets?: boolean }) {
  if (messages.length === 0) return <Empty text={assets ? "User chưa gửi file, ảnh hoặc link." : "User chưa gửi tin nhắn."} />;

  return (
    <div className="overflow-hidden rounded-md border border-border/70">
      {messages.map((message) => (
        <div key={message._id} className="border-b border-border/60 px-4 py-3 last:border-b-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{message.type}</Badge>
            {message.reportStatus && <Badge variant="destructive">Report true</Badge>}
            <span className="text-xs text-muted-foreground">{formatDate(message.createdAt)}</span>
          </div>
          <p className="mt-2 break-words text-sm">{message.preview || message.content || message.fileName || "Không có nội dung"}</p>
          {message.signedUrl && (
            <a className="mt-2 inline-flex text-sm text-primary underline-offset-4 hover:underline" href={message.signedUrl} target="_blank" rel="noreferrer">
              Mở tài nguyên
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-md border border-border/70 text-sm text-muted-foreground">
      {text}
    </div>
  );
}
