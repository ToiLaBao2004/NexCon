import { useState, useEffect, useMemo } from "react";
import UserAvatar from "./UserAvatar";
import { Dialog, DialogPortal, DialogOverlay, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmationModal } from "@/components/shared/ConfirmationModal";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Users, ChevronLeft, MoreHorizontal, UserCircle, UserMinus, Check, X, KeyRound, Search } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { UserProfileDialog } from "../shared/UserProfileDialog";
import { chatService } from "@/services/chatService";
import { useChatStore } from "@/stores/useChatStore";
import { useSocketStore } from "@/stores/useSocketStore";
import { getPresenceBadgeStatus, getPresenceForUser } from "@/utils/userPresence";

interface Props {
  conversationId?: string;
  isApprovalRequired?: boolean;
  participants: any[];
  memberCount?: number;
  isGroupAdmin?: boolean;
  currentUserId?: string;
  adminIds?: string[];
}

const normalizeSearchText = (value?: string | null) =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();

export default function MembersPanel({ conversationId, participants, memberCount, isGroupAdmin, currentUserId, adminIds = [] }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");

  const [approvalQueue, setApprovalQueue] = useState<any[]>([]);
  const [loadingApproval, setLoadingApproval] = useState(false);
  const { handleApproval, removeMember, openChat } = useChatStore();

  const [userToRemove, setUserToRemove] = useState<any>(null);
  const [isConfirmRemoveOpen, setIsConfirmRemoveOpen] = useState(false);
  const [removingUser, setRemovingUser] = useState(false);
  const { onlineUsers, userPresences } = useSocketStore();

  useEffect(() => {
    const fetchQueue = () => {
      if (isGroupAdmin && conversationId) {
        chatService.getApprovalQueue(conversationId)
          .then(res => setApprovalQueue(res.queue || []))
          .catch(console.error);
      }
    };

    fetchQueue();

    const { socket } = useSocketStore.getState();
    if (socket) {
      socket.on("approval-queue-updated", fetchQueue);
      return () => {
        socket.off("approval-queue-updated", fetchQueue);
      };
    }
  }, [isGroupAdmin, conversationId]);

  useEffect(() => {
    if (!open) {
      setMemberSearch("");
    }
  }, [open]);

  const filteredParticipants = useMemo(() => {
    const query = normalizeSearchText(memberSearch);

    if (!query) {
      return participants;
    }

    return participants.filter((p: any) => {
      const u = p.userId || p;
      const searchableText = normalizeSearchText(
        [u?.nickname, u?.displayName, u?.email, u?.phone].filter(Boolean).join(" ")
      );

      return searchableText.includes(query);
    });
  }, [participants, memberSearch]);

  const onHandleApproval = async (userId: string, action: 'approve' | 'reject') => {
    if (!conversationId) return;
    try {
      setLoadingApproval(true);
      await handleApproval(conversationId, userId, action);
      setApprovalQueue(prev => prev.filter(item => item.userId?._id !== userId));
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingApproval(false);
    }
  };

  const handleShowProfile = (user: any) => {
    setSelectedUser(user);
    setIsProfileOpen(true);
  };

  const confirmRemove = (user: any) => {
    setUserToRemove(user);
    setIsConfirmRemoveOpen(true);
  };

  const handleRemoveMember = async () => {
    if (!conversationId || !userToRemove) return;
    try {
      setRemovingUser(true);
      await removeMember(conversationId, userToRemove._id);
      setIsConfirmRemoveOpen(false);
      setUserToRemove(null);
    } catch (error) {
      console.error(error);
    } finally {
      setRemovingUser(false);
    }
  };

  return (
    <>
      <div
        role="button"
        onClick={() => setOpen(true)}
        className="flex w-full cursor-pointer items-center gap-3 bg-card px-5 py-3.5 text-foreground transition-colors hover:bg-muted/60"
      >
        <Users className="h-5 w-5 shrink-0 text-foreground" strokeWidth={1.65} />
        <div className="flex flex-1 items-center justify-between">
          <span className="text-[15px] font-normal">{memberCount ?? participants.length} thành viên</span>
          {isGroupAdmin && approvalQueue?.length > 0 && (
            <span className="flex h-5 items-center justify-center rounded-full bg-red-500 px-2 text-[11px] font-medium text-white shadow-sm">
              {approvalQueue.length} chờ duyệt
            </span>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPortal>
          <DialogOverlay className="bg-transparent" />
          <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-[201] m-0 w-screen rounded-none border-l border-border/40 bg-card p-0 shadow-2xl focus:outline-none sm:w-[380px] sm:max-w-full data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-right-full duration-300">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40 bg-card">
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-muted/10">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <DialogHeader className="p-0">
                <DialogTitle className="text-base font-medium">Thành viên</DialogTitle>
              </DialogHeader>
            </div>

            <div className="p-1 overflow-y-auto h-[calc(100%-57px)] bg-card beautiful-scrollbar">
              <div className="flex flex-col gap-0.5 pb-4">
                {isGroupAdmin && approvalQueue?.length > 0 && (
                  <div className="mb-4">
                    <div className="px-3 py-2 mt-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Yêu cầu tham gia ({approvalQueue?.length || 0})
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {approvalQueue.map((item: any) => {
                        const u = item.userId;
                        if (!u) return null;
                        const name = u.nickname?.trim() || u.displayName || "Người dùng";
                        const presence = getPresenceForUser(u._id?.toString?.() || "", userPresences, u.presence ?? null, onlineUsers);
                        const badgeStatus = getPresenceBadgeStatus(presence);
                        return (
                          <div key={u._id} className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-muted/10 text-left transition-colors group">
                            <div className="shrink-0 cursor-pointer" onClick={() => handleShowProfile(u)}>
                              <UserAvatar type="sidebar" name={name} avatarUrl={u?.avatarUrl} className="!h-9 !w-9 !text-sm border border-border/10" status={badgeStatus} />
                            </div>
                            <div className="flex-1 cursor-pointer min-w-0" onClick={() => handleShowProfile(u)}>
                              <div className="font-medium text-[14px] text-foreground truncate">{name}</div>
                              <div className="text-[11.5px] text-muted-foreground truncate leading-tight">Thêm bởi: {item.addedBy?.displayName || 'Người dùng'}</div>
                            </div>
                            <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                              <button onClick={(e) => { e.stopPropagation(); onHandleApproval(u._id, 'approve'); }} disabled={loadingApproval} className="p-1.5 rounded-full bg-green-500/10 text-green-500 hover:bg-green-500/20 transition-colors focus:opacity-100">
                                <Check className="h-4 w-4" />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); onHandleApproval(u._id, 'reject'); }} disabled={loadingApproval} className="p-1.5 rounded-full bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors focus:opacity-100">
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="px-3 py-2 mt-2 text-[15px] font-bold text-foreground tracking-normal flex items-center justify-between">
                  <span>Danh sách thành viên</span>
                  <span className="bg-muted/60 px-2 py-0.5 rounded-full text-xs font-semibold text-foreground">{filteredParticipants.length}</span>
                </div>

                <div className="px-3 pb-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={memberSearch}
                      onChange={(event) => setMemberSearch(event.target.value)}
                      placeholder="Tìm kiếm thành viên"
                      className="h-10 rounded-full bg-muted/50 pl-9 pr-9 text-[14px] shadow-none focus-visible:ring-2"
                    />
                    {memberSearch && (
                      <button
                        type="button"
                        aria-label="Xóa tìm kiếm"
                        onClick={() => setMemberSearch("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {filteredParticipants.length === 0 && (
                  <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                    Không tìm thấy thành viên phù hợp
                  </div>
                )}

                {filteredParticipants.map((p: any) => {
                  const u = p.userId || p;
                  const name = u?.nickname?.trim() || u?.displayName || "Người dùng";
                  const isMe = u?._id?.toString() === currentUserId?.toString();
                  const presence = getPresenceForUser(u?._id?.toString?.() || "", userPresences, u?.presence ?? null, onlineUsers);
                  const badgeStatus = getPresenceBadgeStatus(presence);
                  const isLeader = adminIds.some((id) => id?.toString?.() === u?._id?.toString?.());

                  return (
                    <div
                      key={p._id || u?._id || name}
                      className="group flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-muted/10 text-left transition-colors"
                    >
                      <div
                        className="shrink-0 cursor-pointer"
                        onClick={() => handleShowProfile(u)}
                      >
                        <UserAvatar type="sidebar" name={name} avatarUrl={u?.avatarUrl} className="!h-9 !w-9 !text-sm border border-border/10" status={badgeStatus} />
                      </div>
                      <div
                        className="flex-1 cursor-pointer min-w-0"
                        onClick={() => handleShowProfile(u)}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className="font-medium text-[14px] text-foreground truncate">{name}</div>
                          {isLeader && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-500 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm shrink-0">
                              <KeyRound className="h-3 w-3" />
                              Trưởng nhóm
                            </span>
                          )}
                        </div>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1.5 rounded-full hover:bg-muted/20 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity data-[state=open]:opacity-100 outline-none">
                            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 z-[210]">
                          <DropdownMenuItem onClick={() => handleShowProfile(u)}>
                            <UserCircle className="mr-2 h-4 w-4" />
                            <span>Xem thông tin</span>
                          </DropdownMenuItem>

                          {isGroupAdmin && !isMe && (
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => confirmRemove(u)}>
                              <UserMinus className="mr-2 h-4 w-4" />
                              <span>Xóa khỏi nhóm</span>
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })}
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>

      {selectedUser && (
        <UserProfileDialog
          open={isProfileOpen}
          onOpenChange={setIsProfileOpen}
          user={{
            _id: selectedUser._id,
            displayName: selectedUser.displayName,
            email: selectedUser.email,
            avatarUrl: selectedUser.avatarUrl,
            bio: selectedUser.bio,
            phone: selectedUser.phone
          }}
          onOpenChat={async (user) => {
            setIsProfileOpen(false);
            setOpen(false);
            await openChat({ userId: user.friendId || user._id });
          }}
        />
      )}

      <ConfirmationModal
        isOpen={isConfirmRemoveOpen}
        onClose={() => setIsConfirmRemoveOpen(false)}
        onConfirm={handleRemoveMember}
        title="Xóa thành viên"
        description={`Bạn có chắc chắn muốn xóa ${userToRemove?.displayName || userToRemove?.email || "người dùng này"} khỏi nhóm?`}
        confirmText="Xóa khỏi nhóm"
        variant="destructive"
        isLoading={removingUser}
      />
    </>
  );
}
