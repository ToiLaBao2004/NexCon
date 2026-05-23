import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChatStore } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { useSocketStore } from "@/stores/useSocketStore";
import { toast } from "sonner";
import UserAvatar from "./UserAvatar";
import { Search } from "lucide-react";
import { getPresenceBadgeStatus, getPresenceForUser } from "@/utils/userPresence";

interface LeaveGroupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  isGroupAdmin?: boolean;
  participants?: any[];
}

export function LeaveGroupModal({
  open,
  onOpenChange,
  conversationId,
  isGroupAdmin = false,
  participants = [],
}: LeaveGroupModalProps) {
  const { user } = useAuthStore();
  const { onlineUsers, userPresences } = useSocketStore();
  const { leaveGroup } = useChatStore();
  const [silent, setSilent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedNewAdminId, setSelectedNewAdminId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");

  const eligibleNewAdmins = useMemo(() => {
    return participants
      .map((p) => p?.userId || p)
      .filter((u) => u?._id && u._id !== user?._id);
  }, [participants, user?._id]);

  const mustSelectNewAdmin = isGroupAdmin && eligibleNewAdmins.length > 0;
  const filteredNewAdmins = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return eligibleNewAdmins;
    return eligibleNewAdmins.filter((u) => {
      const name = (u.displayName || "Người dùng").toLowerCase();
      return name.includes(q);
    });
  }, [eligibleNewAdmins, searchQuery]);

  const handleLeave = async () => {
    if (mustSelectNewAdmin && !selectedNewAdminId) {
      toast.error("Bạn cần chọn trưởng nhóm mới trước khi rời nhóm.");
      return;
    }

    try {
      setLoading(true);
      await leaveGroup(conversationId, silent, selectedNewAdminId || undefined);
      onOpenChange(false);
      setSelectedNewAdminId("");
      toast.success("Bạn đã rời khỏi nhóm.");
    } catch (error: any) {
      toast.error(error?.message ?? "Không thể rời nhóm. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Rời nhóm và xóa trò chuyện</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-1">
            Bạn sẽ không thể xem lại tin nhắn trong nhóm này sau khi rời nhóm.
          </DialogDescription>
        </DialogHeader>

        {mustSelectNewAdmin && (
          <div className="rounded-lg border border-amber-300/70 bg-amber-50 px-4 py-3 space-y-2">
            <p className="text-sm font-semibold text-amber-900">Chọn trưởng nhóm mới trước khi rời nhóm</p>
            <p className="text-xs text-amber-800/90">
              Bạn đang là trưởng nhóm. Vui lòng chọn người kế nhiệm để tiếp tục.
            </p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm theo tên..."
                className="h-9 pl-9 bg-background"
              />
            </div>
            <div className="max-h-44 overflow-y-auto beautiful-scrollbar space-y-1 pr-1">
              {filteredNewAdmins.map((member) => {
                const presence = getPresenceForUser(member._id?.toString?.() || "", userPresences, member.presence ?? null, onlineUsers);
                const badgeStatus = getPresenceBadgeStatus(presence);
                return (
                  <label
                    key={member._id}
                    className="flex items-center gap-3 rounded-md border border-border/60 bg-background px-3 py-2 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="new-leader"
                      checked={selectedNewAdminId === member._id}
                      onChange={() => setSelectedNewAdminId(member._id)}
                      className="h-4 w-4"
                    />
                    <UserAvatar
                      type="sidebar"
                      name={member.displayName || "Người dùng"}
                      avatarUrl={member.avatarUrl}
                      className="h-8 w-8"
                      status={badgeStatus}
                    />
                    <div className="min-w-0">
                      <span className="block text-sm text-foreground truncate">
                        {member.displayName || "Người dùng"}
                      </span>
                    </div>
                  </label>
                );
              })}
              {filteredNewAdmins.length === 0 && (
                <p className="py-3 text-center text-xs text-muted-foreground">Không tìm thấy thành viên phù hợp.</p>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 px-4 py-3 mt-1">
          <div>
            <p className="text-sm font-semibold text-foreground">Rời nhóm trong im lặng</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Chỉ trưởng nhóm biết bạn rời nhóm.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={silent}
            onClick={() => setSilent((v) => !v)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${silent ? "bg-primary" : "bg-muted/60"
              }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${silent ? "translate-x-5" : "translate-x-0"
                }`}
            />
          </button>
        </div>

        <DialogFooter className="gap-2 mt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="flex-1"
          >
            Hủy
          </Button>
          <Button
            variant="destructive"
            onClick={handleLeave}
            disabled={loading || (mustSelectNewAdmin && !selectedNewAdminId)}
            className="flex-1"
          >
            {loading ? "Đang xử lý..." : "Rời nhóm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
