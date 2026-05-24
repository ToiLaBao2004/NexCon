import React, { useState, useMemo, useEffect, useRef, forwardRef } from "react";
import type { Conversation } from "@/types/chat";
import { useAuthStore } from "@/stores/useAuthStore";
import { useFriendStore } from "@/stores/useFriendStore";
import { useChatStore } from "@/stores/useChatStore";
import { useSocketStore } from "@/stores/useSocketStore";
import UserAvatar from "./UserAvatar";
import GroupChatAvatar from "./GroupChatAvatar";
import NewGroupModal from "./NewGroupModal";
import { Settings2, Clock, Users, LogOut } from "lucide-react";
import { SidebarMediaLinks } from "./SidebarMediaLinks";
import { cn } from "@/lib/utils";
import { GroupManagementPanel } from "./GroupManagementPanel";
import { AddMemberModal } from "./AddMemberModal";
import { LeaveGroupModal } from "./LeaveGroupModal";
import { toast } from "sonner";

const ActionBtnLocal = forwardRef<HTMLButtonElement, {
  icon: React.ElementType;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}>(({ icon: Icon, label, onClick, disabled, ...props }, ref) => {
  return (
    <button
      ref={ref}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-w-0 flex-col items-center gap-2 rounded-xl px-1.5 py-2 transition-colors bg-transparent",
        disabled ? "opacity-100 cursor-default" : "hover:bg-muted/60 cursor-pointer"
      )}
      {...props}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted/40 text-foreground">
        <Icon className="h-5 w-5" strokeWidth={1.55} />
      </div>
      <span className="w-full max-w-[76px] text-center text-[13px] font-normal leading-4 text-foreground sm:text-[15px] sm:leading-5">{label}</span>
    </button>
  );
});
ActionBtnLocal.displayName = "ActionBtnLocal";
import { Bell, BellOff, Pin, UserPlus, Pencil, Camera, Loader2 } from "lucide-react";
import { isMuted } from "@/utils/isMuted";
import { MuteDropdown } from "./MuteDropdown";
import { MutualGroupsPanel } from "./MutualGroups";
import ConversationLists from "./ConversationLists";
import { ConversationRemindersPanel } from "./ConversationRemindersPanel";
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
import { FIELD_LIMITS, checkFieldFormat } from "@/lib/fieldFormat";
import { ImageCropDialog, type CropPreset } from "@/components/shared/ImageCropDialog";
import { validateImageFile } from "@/lib/imageCrop";
import { getPresenceBadgeStatus, getPresenceForUser, getPresenceText } from "@/utils/userPresence";
import { getApiErrorMessage } from "@/lib/apiMessage";

interface ConversationInfoSidebarProps {
  conversation: Conversation;
}

const groupAvatarCropPresets: CropPreset[] = [
  { id: "square", label: "1:1", aspect: 1, outputWidth: 1024, outputHeight: 1024 },
];

const getUploadErrorMessage = (error: unknown, fallback: string) => {
  return getApiErrorMessage(error, fallback);
};

// Main component
export default function ConversationInfoSidebar({ conversation, }: ConversationInfoSidebarProps) {
  const { user } = useAuthStore();
  const { conversations } = useChatStore();
  const { onlineUsers, userPresences } = useSocketStore();
  const [mutualPopoverOpen, setMutualPopoverOpen] = useState(false);
  const { setNickName, loading: nicknameLoading, friends } = useFriendStore();
  const [newGroupInitialSelected, setNewGroupInitialSelected] = useState<string[] | undefined>(undefined);
  const { fetchConversations, updateGroupName, updateGroupAvatar, toggleConversationPin } = useChatStore();

  /* shared modal state */
  const [openNickname, setOpenNickname] = useState(false);
  const [nicknameValue, setNicknameValue] = useState("");
  const [openGroupRename, setOpenGroupRename] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const [groupRenameLoading, setGroupRenameLoading] = useState(false);
  const [groupAvatarLoading, setGroupAvatarLoading] = useState(false);
  const [groupAvatarProgress, setGroupAvatarProgress] = useState<number | null>(null);
  const [groupAvatarCropFile, setGroupAvatarCropFile] = useState<File | null>(null);
  const [isNewGroupModalOpen, setIsNewGroupModalOpen] = useState(false);
  const [manageGroupOpen, setManageGroupOpen] = useState(false);

  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [isLeaveGroupModalOpen, setIsLeaveGroupModalOpen] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  const [remindersOpen, setRemindersOpen] = useState(false);

  // refs for name elements (used for a11y / future enhancements)
  const nameRefDirect = useRef<HTMLSpanElement | null>(null);
  const nameRefGroup = useRef<HTMLSpanElement | null>(null);
  const groupAvatarInputRef = useRef<HTMLInputElement | null>(null);

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

  const directPresence = getPresenceForUser(
    otherParticipant?.userId?._id,
    userPresences,
    otherParticipant?.userId?.presence ?? null,
    onlineUsers,
  );
  const directBadgeStatus = getPresenceBadgeStatus(directPresence);
  const directPresenceText = getPresenceText(directPresence);

  const groupDisplayName = conversation.group?.name || "Nhóm";
  const isConversationPinned = conversation.isPinned === true;

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
    const nicknameError = checkFieldFormat("nickname", val);
    if (nicknameError) {
      toast.error(nicknameError);
      return;
    }
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

  const handlePickGroupAvatar = () => {
    groupAvatarInputRef.current?.click();
  };

  const handleGroupAvatarFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    const error = validateImageFile(file);
    if (error) {
      toast.error(error);
      return;
    }

    setGroupAvatarCropFile(file);
  };

  const handleGroupAvatarCropConfirm = async (file: File) => {
    try {
      setGroupAvatarLoading(true);
      setGroupAvatarProgress(0);
      await updateGroupAvatar(conversation._id, file, setGroupAvatarProgress);
      setGroupAvatarCropFile(null);
      toast.success("Đã cập nhật ảnh đại diện nhóm");
    } catch (error: unknown) {
      toast.error(getUploadErrorMessage(error, "Không thể cập nhật ảnh nhóm"));
    } finally {
      setGroupAvatarLoading(false);
      setGroupAvatarProgress(null);
    }
  };

  const handleToggleConversationPin = async () => {
    try {
      setPinLoading(true);
      await toggleConversationPin(conversation._id);
      toast.success(isConversationPinned ? "Đã bỏ ghim hội thoại" : "Đã ghim hội thoại");
    } catch {
      toast.error("Không thể cập nhật trạng thái ghim hội thoại");
    } finally {
      setPinLoading(false);
    }
  };

  if (!user) return null;

  // DIRECT variant
  if (conversation.type === "direct") {
    return (
      <aside className="flex h-full w-full min-w-0 flex-col overflow-y-auto overflow-x-hidden bg-card beautiful-scrollbar md:border-l md:border-border/40">
        <div className="flex flex-col items-center border-b border-border/40 bg-card px-4 pb-5 pt-6 sm:px-5">
          <div className="flex w-full max-w-[380px] flex-col items-center">
            <div className="relative mb-2 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full">
              <UserAvatar
                type="profile"
                name={directDisplayName}
                avatarUrl={otherParticipant?.userId?.avatarUrl ?? undefined}
                className="!h-20 !w-20 !text-2xl"
                status={directBadgeStatus}
              />
            </div>

            <div className="relative w-full mt-0 mb-3">
              <div className="w-full flex justify-center">
                <div className="relative inline-block">
                  <span ref={nameRefDirect} className="block text-center text-xl font-bold leading-tight text-foreground">
                    {directDisplayName}
                  </span>
                  <span className="mt-1 block text-center text-xs text-muted-foreground">
                    {directPresenceText}
                  </span>
                  <button
                    onClick={() => setOpenNickname(true)}
                    title="Đổi nickname"
                    className="absolute left-full top-1/2 ml-3 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted/60"
                  >
                    <Pencil className="h-[13px] w-[13px]" strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-2 grid w-full grid-cols-3 gap-1.5 px-0 sm:gap-3 sm:px-2">
              <MuteDropdown conversationId={conversation._id}>
                <ActionBtnLocal icon={isMuted(conversation.participants.find(p => (p.userId?._id || p.userId)?.toString() === user?._id?.toString())?.mute, "messages") || isMuted(conversation.participants.find(p => (p.userId?._id || p.userId)?.toString() === user?._id?.toString())?.mute, "meetings") ? BellOff : Bell} label="Thông báo" />
              </MuteDropdown>
              <ActionBtnLocal
                icon={Pin}
                label={isConversationPinned ? "Bỏ ghim" : "Ghim hội thoại"}
                onClick={handleToggleConversationPin}
                disabled={pinLoading}
              />
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
        <div className="h-2 w-full shrink-0 bg-muted/40 pointer-events-none" />
        <button
          onClick={() => setRemindersOpen(true)}
          className="flex w-full cursor-pointer items-center gap-3 bg-card px-5 py-3.5 text-foreground transition-colors hover:bg-muted/60"
        >
          <Clock className="h-5 w-5 shrink-0 text-foreground" strokeWidth={1.65} />
          <span className="text-[15px] font-normal">Danh sách nhắc hẹn</span>
        </button>
        <div
          role="button"
          onClick={() => setMutualPopoverOpen(true)}
          className="flex w-full cursor-pointer items-center gap-3 bg-card px-5 py-3.5 text-foreground transition-colors hover:bg-muted/60"
        >
          <Users className="h-5 w-5 shrink-0 text-foreground" strokeWidth={1.65} />
          <span className="text-[15px] font-normal">{`${mutualGroupCount} nhóm chung`}</span>
        </div>
        <MutualGroupsPanel open={mutualPopoverOpen} onOpenChange={setMutualPopoverOpen} otherParticipantId={otherParticipant?.userId?._id} />
        <ConversationRemindersPanel
          open={remindersOpen}
          onOpenChange={setRemindersOpen}
          conversationId={conversation._id}
          conversationName={directDisplayName}
        />
        <div className="h-2 w-full shrink-0 bg-muted/40 pointer-events-none" />

        {/* Media, Files, Links */}
        <SidebarMediaLinks conversation={conversation} />

        {/* Nickname dialog */}
        <Dialog open={openNickname} onOpenChange={setOpenNickname}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Đổi nickname</DialogTitle>
              <DialogDescription>
                Nickname sẽ áp dụng trong mọi cuộc trò chuyện.
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
            <div className="text-right text-xs text-muted-foreground">
              {nicknameValue.trim().length}/{FIELD_LIMITS.nickname}
            </div>
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

  const isGroup = conversation.type === "group";
  const isDisbanded = isGroup && conversation.disbanded === true;
  const isGroupAdmin = !!(isGroup && conversation.group?.admins?.some(
    (adminId: any) => String(adminId?._id || adminId) === String(user?._id)
  ));
  const canUpdateGroupInfo = !isDisbanded && (isGroupAdmin || conversation.group?.allowMembersChangeAvatar !== false);

  return (
    <aside className="flex h-full w-full min-w-0 flex-col overflow-y-auto overflow-x-hidden bg-card beautiful-scrollbar md:border-l md:border-border/40">
      <div className="flex flex-col items-center border-b border-border/40 bg-card px-4 pb-5 pt-6 sm:px-5">
        <div className="flex w-full max-w-[380px] flex-col items-center">
          <div className="relative mb-2">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full">
              <GroupChatAvatar
                participants={conversation.participants}
                type="profile"
                groupAvatarUrl={conversation.group?.avatarUrl}
              />
            </div>
            {canUpdateGroupInfo && (
              <button
                type="button"
                onClick={handlePickGroupAvatar}
                disabled={groupAvatarLoading}
                className="absolute bottom-0 right-0 z-40 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-70"
                title="Đổi ảnh đại diện nhóm"
              >
                {groupAvatarLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.8} />
                ) : (
                  <Camera className="h-3.5 w-3.5" strokeWidth={1.8} />
                )}
              </button>
            )}
            <input
              ref={groupAvatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleGroupAvatarFileChange}
            />
          </div>

          <div className="relative w-full mt-0 mb-3">
            <div className="w-full flex justify-center">
              <div className="relative inline-block">
                  <span ref={nameRefGroup} className="block text-center text-xl font-bold leading-tight text-foreground">
                  {groupDisplayName}
                </span>
                <button
                  onClick={() => { if (canUpdateGroupInfo) setOpenGroupRename(true); }}
                  title={isDisbanded ? "Nhóm đã giải tán" : (!canUpdateGroupInfo ? "Chỉ quản trị viên mới có thể đổi tên nhóm lúc này" : "Đổi tên nhóm")}
                  disabled={!canUpdateGroupInfo}
                  className={cn(
                    "absolute left-full top-1/2 ml-3 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-foreground transition-colors",
                    !canUpdateGroupInfo ? "opacity-50 cursor-not-allowed" : "hover:bg-muted/60"
                  )}
                >
                  <Pencil className="h-[13px] w-[13px]" strokeWidth={1.5} />
                </button>
              </div>
            </div>
          </div>

          <div className="mt-2 grid w-full grid-cols-4 gap-1 px-0 sm:gap-2 sm:px-1">
            <MuteDropdown conversationId={conversation._id} disabled={isDisbanded}>
              <ActionBtnLocal icon={isMuted(conversation.participants.find(p => (p.userId?._id || p.userId)?.toString() === user?._id?.toString())?.mute, "messages") || isMuted(conversation.participants.find(p => (p.userId?._id || p.userId)?.toString() === user?._id?.toString())?.mute, "meetings") ? BellOff : Bell} label="Thông báo" disabled={isDisbanded} />
            </MuteDropdown>
            <ActionBtnLocal
              icon={Pin}
              label={isConversationPinned ? "Bỏ ghim" : "Ghim hội thoại"}
              onClick={handleToggleConversationPin}
              disabled={isDisbanded || pinLoading}
            />
            <ActionBtnLocal
              icon={UserPlus}
              label="Thêm thành viên"
              disabled={isDisbanded}
              onClick={() => setIsAddMemberModalOpen(true)}
            />
            <ActionBtnLocal
              icon={Settings2}
              label="Quản lý nhóm"
              onClick={() => setManageGroupOpen(true)}
              disabled={isDisbanded}
            />
          </div>
        </div>
      </div>

      <ConversationLists conversation={conversation} mutualGroupCount={mutualGroupCount} memberCount={memberCount} />

      {!isDisbanded && (
        <button
          onClick={() => setIsLeaveGroupModalOpen(true)}
          className="flex w-full items-center gap-3 bg-card px-5 py-3.5 transition-colors hover:bg-muted/60"
        >
          <LogOut className="h-5 w-5 shrink-0 text-red-500" strokeWidth={1.65} />
          <span className="text-[15px] font-normal text-red-500">Rời nhóm</span>
        </button>
      )}

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

      {/* Group Management Panel */}
      <GroupManagementPanel
        open={manageGroupOpen}
        onOpenChange={setManageGroupOpen}
        conversationId={conversation._id}
        isGroupAdmin={isGroupAdmin}
      />
      <AddMemberModal
        open={isAddMemberModalOpen}
        onOpenChange={setIsAddMemberModalOpen}
        conversation={conversation}
      />
      <LeaveGroupModal
        open={isLeaveGroupModalOpen}
        onOpenChange={setIsLeaveGroupModalOpen}
        conversationId={conversation._id}
        isGroupAdmin={isGroupAdmin}
        participants={conversation.participants}
      />
      <ImageCropDialog
        file={groupAvatarCropFile}
        open={Boolean(groupAvatarCropFile)}
        title="Chỉnh ảnh nhóm"
        cropShape="round"
        presets={groupAvatarCropPresets}
        defaultPresetId="square"
        confirmLabel="Lưu ảnh"
        maxOutputBytes={1024 * 1024}
        uploadProgress={groupAvatarLoading ? groupAvatarProgress : null}
        onCancel={() => setGroupAvatarCropFile(null)}
        onConfirm={handleGroupAvatarCropConfirm}
      />
    </aside>
  );
}
