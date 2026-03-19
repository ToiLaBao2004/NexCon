import { useState, useMemo, useEffect, useRef } from "react";
import type { Conversation } from "@/types/chat";
import { useAuthStore } from "@/stores/useAuthStore";
import { useFriendStore } from "@/stores/useFriendStore";
import { useChatStore } from "@/stores/useChatStore";
import UserAvatar from "./UserAvatar";
import GroupChatAvatar from "./GroupChatAvatar";
import NewGroupModal from "./NewGroupModal";
import { Settings2, Clock, Users } from "lucide-react";
import { SidebarMediaLinks } from "./SidebarMediaLinks";
import { cn } from "@/lib/utils";

function ActionBtnLocal({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ElementType;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-center gap-[6px] rounded-lg py-1 px-1 transition-colors min-w-0 bg-transparent",
        disabled ? "opacity-100 cursor-default" : "hover:bg-muted/30 cursor-pointer"
      )}
    >
      <div className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-muted/10 text-foreground">
        <Icon className="h-5 w-5" strokeWidth={1.2} />
      </div>
      <span className="text-[12px] text-center text-muted-foreground/90 font-normal leading-[16px] w-[65px]">{label}</span>
    </button>
  );
}
import { Bell, Pin, UserPlus, Pencil } from "lucide-react";
import { MutualGroupsPanel } from "./MutualGroups";
import ConversationLists from "./ConversationLists";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface ConversationInfoSidebarProps {
  conversation: Conversation;
}

// Main component
export default function ConversationInfoSidebar({ conversation, }: ConversationInfoSidebarProps) {
  const { user } = useAuthStore();
  const { conversations } = useChatStore();
  const [mutualPopoverOpen, setMutualPopoverOpen] = useState(false);
  const { setNickName, loading: nicknameLoading, friends } = useFriendStore();
  const [newGroupInitialSelected, setNewGroupInitialSelected] = useState<string[] | undefined>(undefined);
  const { fetchConversations, updateGroupName } = useChatStore();

  /* shared modal state */
  const [openNickname, setOpenNickname] = useState(false);
  const [nicknameValue, setNicknameValue] = useState("");
  const [openGroupRename, setOpenGroupRename] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const [groupRenameLoading, setGroupRenameLoading] = useState(false);
  const [isNewGroupModalOpen, setIsNewGroupModalOpen] = useState(false);

  // refs for name elements (used for a11y / future enhancements)
  const nameRefDirect = useRef<HTMLSpanElement | null>(null);
  const nameRefGroup = useRef<HTMLSpanElement | null>(null);

  // helpers
  const otherParticipant = useMemo(() => {
    if (conversation.type !== "direct") return null;
    return (
      conversation.participants.find(
        (p) => p.userId?._id?.toString() !== user?._id?.toString()
      ) ?? null
    );
  }, [conversation, user]);

  const directDisplayName = useMemo(() => {
    return (
      (otherParticipant?.userId?.nickname?.trim()
        ? otherParticipant.userId.nickname
        : otherParticipant?.userId?.displayName) || "Người dùng"
    );
  }, [otherParticipant]);

  const groupDisplayName = conversation.group?.name || "Nhóm";

  const currentNickname = useMemo(() => {
    return otherParticipant?.userId?.nickname ?? "";
  }, [otherParticipant]);

  // mutual group count between current user and other participant
  const mutualGroupCount = useMemo(() => {
    if (!user) return 0;
    if (conversation.type === "direct" && otherParticipant) {
      const otherId = otherParticipant.userId?._id;
      if (!otherId) return 0;
      return conversations.filter((c: any) =>
        c.type === "group" &&
        c.participants?.some((p: any) => p.userId?._id === user._id) &&
        c.participants?.some((p: any) => p.userId?._id === otherId)
      ).length;
    }
    return 0;
  }, [conversations, user, conversation.type, otherParticipant]);



  // (removed DOM measurement code; buttons now positioned via CSS)

  useEffect(() => {
    if (openNickname) setNicknameValue(currentNickname);
  }, [openNickname, currentNickname]);

  useEffect(() => {
    if (openGroupRename) setGroupNameDraft(groupDisplayName);
  }, [openGroupRename, groupDisplayName]);

  // Handlers
  const handleSubmitNickname = async () => {
    const val = nicknameValue;
    if (val === currentNickname) {
      setOpenNickname(false);
      return;
    }
    const friendId = otherParticipant?.userId?._id;
    if (!friendId) return;
    try {
      await setNickName(friendId, val);
      setOpenNickname(false);
      fetchConversations();
    } catch {
      // error handled in store
    }
  };

  const handleSubmitGroupName = async () => {
    const val = groupNameDraft.trim();
    if (!val || val === groupDisplayName) {
      setOpenGroupRename(false);
      return;
    }
    try {
      setGroupRenameLoading(true);
      await updateGroupName(conversation._id, val);
      setOpenGroupRename(false);
      fetchConversations();
    } finally {
      setGroupRenameLoading(false);
    }
  };

  if (!user) return null;

  // DIRECT variant
  if (conversation.type === "direct") {
    return (
      <aside className="flex flex-col h-full min-w-[350px] bg-background border-l border-border/40 overflow-y-auto overflow-x-hidden beautiful-scrollbar">
        <div className="flex flex-col items-center pt-6 pb-4 bg-card">
          <div className="w-[350px] flex flex-col items-center">
            <div className="relative mb-1 h-16 w-16 flex items-center justify-center rounded-full overflow-hidden">
              <UserAvatar
                type="profile"
                name={directDisplayName}
                avatarUrl={otherParticipant?.userId?.avatarUrl ?? undefined}
                className="!h-16 !w-16 !text-xl"
              />
            </div>

            <div className="relative w-full mt-0 mb-3">
              <div className="w-full flex justify-center">
                <div className="relative inline-block">
                  <span ref={nameRefDirect} className="font-bold text-[17px] text-foreground leading-tight block text-center">
                    {directDisplayName}
                  </span>
                  <button
                    onClick={() => setOpenNickname(true)}
                    title="Đổi nickname"
                    className="absolute left-full top-1/2 ml-3 -translate-y-1/2 flex items-center justify-center h-7 w-7 rounded-full bg-card/10 text-muted-foreground hover:bg-muted/20 transition-colors"
                  >
                    <Pencil className="h-[13px] w-[13px]" strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-center gap-4 w-full px-2 mt-2">
              <ActionBtnLocal icon={Bell} label="Tắt thông báo" disabled />
              <ActionBtnLocal icon={Pin} label="Ghim hội thoại" disabled />
              <ActionBtnLocal
                icon={UserPlus}
                label="Tạo nhóm trò chuyện"
                onClick={() => {
                  // try to find friendId for the other participant
                  const otherUserId = otherParticipant?.userId?._id?.toString();
                  let selectedId: string | undefined = undefined;
                  if (otherUserId) {
                    const f = friends.find((fr: any) => (fr.userId?._id?.toString() === otherUserId) || (fr.friendId === otherUserId));
                    selectedId = f?.friendId ?? otherUserId;
                  }
                  setNewGroupInitialSelected(selectedId ? [selectedId] : undefined);
                  setIsNewGroupModalOpen(true);
                }}
              />
            </div>
          </div>
        </div>
        <div className="h-2 w-full bg-background shrink-0 pointer-events-none" />
        <button
          className="flex w-full items-center gap-3 px-4 py-3 text-foreground hover:bg-muted/10 transition-colors bg-card font-normal"
        >
          <Clock className="h-5 w-5 text-muted-foreground/70 shrink-0" strokeWidth={1.5} />
          <span className="text-[15px]">Danh sách nhắc hẹn</span>
        </button>
        <div
          role="button"
          onClick={() => setMutualPopoverOpen(true)}
          className="flex w-full items-center gap-3 px-4 py-3 text-foreground hover:bg-muted/10 transition-colors bg-card font-normal cursor-pointer"
        >
          <Users className="h-5 w-5 text-muted-foreground/70 shrink-0" strokeWidth={1.5} />
          <span className="text-[15px]">{`${mutualGroupCount} nhóm chung`}</span>
        </div>
        <MutualGroupsPanel open={mutualPopoverOpen} onOpenChange={setMutualPopoverOpen} otherParticipantId={otherParticipant?.userId?._id} />
        <div className="h-2 w-full bg-background shrink-0 pointer-events-none" />

        {/* Media, Files, Links */}
        <SidebarMediaLinks conversation={conversation} />

        {/* Nickname dialog */}
        <Dialog open={openNickname} onOpenChange={setOpenNickname}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Đổi nickname</DialogTitle>
              <DialogDescription>
                Nickname chỉ áp dụng trong cuộc chat này.
              </DialogDescription>
            </DialogHeader>
            <Input
              value={nicknameValue}
              onChange={(e) => setNicknameValue(e.target.value)}
              placeholder="Nhập nickname mới"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !nicknameLoading) handleSubmitNickname();
              }}
            />
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setOpenNickname(false)}
                disabled={nicknameLoading}
              >
                Hủy
              </Button>
              <Button onClick={handleSubmitNickname} disabled={nicknameLoading}>
                {nicknameLoading ? "Đang lưu..." : "Lưu"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* New group modal */}
        <NewGroupModal
          isOpen={isNewGroupModalOpen}
          onClose={() => { setIsNewGroupModalOpen(false); setNewGroupInitialSelected(undefined); }}
          initialSelected={newGroupInitialSelected}
        />
      </aside>
    );
  }

  // GROUP variant
  const memberCount = conversation.participants.length;

  return (
    <aside className="flex flex-col h-full min-w-[350px] bg-background border-l border-border/40 overflow-y-auto overflow-x-hidden beautiful-scrollbar">
      <div className="flex flex-col items-center pt-6 pb-4 bg-card">
        <div className="w-[350px] flex flex-col items-center">
          <div className="relative mb-1 h-16 w-16 flex items-center justify-center rounded-full overflow-hidden">
            <GroupChatAvatar participants={conversation.participants} type="sidebar" />
          </div>

          <div className="relative w-full mt-0 mb-3">
            <div className="w-full flex justify-center">
              <div className="relative inline-block">
                <span ref={nameRefGroup} className="font-bold text-[17px] text-foreground leading-tight block text-center">
                  {groupDisplayName}
                </span>
                <button
                  onClick={() => setOpenGroupRename(true)}
                  title="Đổi tên nhóm"
                  className="absolute left-full top-1/2 ml-3 -translate-y-1/2 flex items-center justify-center h-7 w-7 rounded-full bg-card/10 text-muted-foreground hover:bg-muted/20 transition-colors"
                >
                  <Pencil className="h-[13px] w-[13px]" strokeWidth={1.5} />
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-center gap-4 w-full px-2 mt-2">
            <ActionBtnLocal icon={Bell} label="Tắt thông báo" disabled />
            <ActionBtnLocal icon={Pin} label="Ghim hội thoại" disabled />
            <ActionBtnLocal icon={UserPlus} label="Thêm thành viên" disabled />
            <ActionBtnLocal icon={Settings2} label="Quản lý nhóm" disabled />
          </div>
        </div>
      </div>

      <ConversationLists conversation={conversation} mutualGroupCount={mutualGroupCount} memberCount={memberCount} />

      {/* Group rename dialog */}
      <Dialog open={openGroupRename} onOpenChange={setOpenGroupRename}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Đổi tên nhóm</DialogTitle>
            <DialogDescription>
              Tên mới sẽ hiển thị cho tất cả thành viên trong nhóm.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={groupNameDraft}
            onChange={(e) => setGroupNameDraft(e.target.value)}
            placeholder="Nhập tên nhóm mới"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && !groupRenameLoading) handleSubmitGroupName();
            }}
          />
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setOpenGroupRename(false)}
              disabled={groupRenameLoading}
            >
              Hủy
            </Button>
            <Button
              onClick={handleSubmitGroupName}
              disabled={!groupNameDraft.trim() || groupRenameLoading}
            >
              {groupRenameLoading ? "Đang lưu..." : "Lưu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
