import type { Conversation } from '@/types/chat'
import ChatCard from './ChatCard'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChatStore } from '@/stores/useChatStore';
import { useFriendStore } from '@/stores/useFriendStore';
import { cn } from '@/lib/utils';
import UserAvatar from './UserAvatar';
import StatusBadge from './StatusBadge';
import UnreadCountBadge from './UnreadCountBadge';
import MentionCountBadge from './MentionCountBadge';
import { useSocketStore } from '@/stores/useSocketStore';
import { MoreHorizontal, PencilLine, UserX, Paperclip, Image as ImageIcon, Link2, Trash2, Pin, Mail, MailOpen, Mic, BellOff, Flag } from "lucide-react";
import { StickerIcon as Sticker } from "@/components/shared/StickerIcon";
import { isUrl } from '@/lib/utils';
import { isMuted } from '@/utils/isMuted';
import { MuteSubMenu } from './MuteSubMenu';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { UserActionDropdown } from "../shared/UserActionDropdown";
import { useEffect, useMemo, useState } from "react";
import { ConfirmationModal } from "../shared/ConfirmationModal";
import { getSystemMessageText } from '@/utils/chatUtils';
import { FIELD_LIMITS, checkFieldFormat } from '@/lib/fieldFormat';
import { toast } from "sonner";
import { ReportDialog } from "../shared/ReportDialog";

const MENTION_TOKEN_REGEX = /@\[USER:([^\]]+)\]/g;

const decodeMentionTokens = (text: string, convo: Conversation) => {
  if (!text) return text;

  return text.replace(MENTION_TOKEN_REGEX, (_raw, userId) => {
    const mentionUserId = String(userId || "").trim();
    if (!mentionUserId) return "@Người dùng";

    const participant = convo.participants.find(
      (item) => String(item.userId?._id || item.userId) === mentionUserId
    );

    const displayName =
      participant?.userId?.nickname?.trim() || participant?.userId?.displayName || "Người dùng";

    return `@${displayName}`;
  });
};

const DirectMessageCard = ({ convo, density = "default" }: { convo: Conversation; density?: "default" | "people" }) => {
  const { user } = useAuthStore();
  const { focusedConversationId, setActiveConversation, messages, fetchMessages, fetchConversations, clearConversation, toggleConversationPin, markAsUnread, markAsSeen, drafts } = useChatStore();
  const { onlineUsers } = useSocketStore();
  const { setNickName, loading } = useFriendStore();
  const active = focusedConversationId === convo._id;

  const [openRename, setOpenRename] = useState(false);
  const [nickname, setNicknameValue] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [openClearConfirm, setOpenClearConfirm] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [openReportUser, setOpenReportUser] = useState(false);

  const isConversationPinned = convo.isPinned === true;

  const currentNickname = useMemo(() => {
    const otherUser = convo.participants.find((p) => p.userId?._id?.toString() !== user?._id?.toString());
    if (otherUser?.userId?.isLocked || otherUser?.userId?.lock?.isLocked) return "";
    return otherUser?.userId?.nickname ?? "";
  }, [convo.participants, user?._id]);

  useEffect(() => {
    if (openRename) {
      setNicknameValue(currentNickname);
    }
  }, [openRename, currentNickname]);

  const myParticipant = convo.participants.find((p) => (p.userId?._id || p.userId)?.toString() === user?._id?.toString());
  const isPartiallyMuted = isMuted(myParticipant?.mute, "messages") || isMuted(myParticipant?.mute, "meetings");

  if (!user) return null;

  const otherUser = convo.participants.find((p) => p.userId?._id?.toString() !== user._id.toString());
  if (!otherUser) return null;
  const isOtherUserLocked = Boolean(otherUser.userId?.isLocked || otherUser.userId?.lock?.isLocked);

  const displayName = !isOtherUserLocked && otherUser?.userId?.nickname?.trim()
    ? otherUser.userId.nickname
    : otherUser?.userId?.displayName ?? "";

  const unreadCount = convo.unreadCounts[user._id];
  const unreadMentionCount = myParticipant?.unreadMentionCount ?? 0;

  const handleSelectConversation = async (id: string) => {
    setActiveConversation(id);

    if (!messages[id]) {
      await fetchMessages(id);
    }
  };
  const onChangeNickname = () => {
    setDropdownOpen(false);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    requestAnimationFrame(() => {
      setOpenRename(true);
    });
  };

  const onSubmitNickname = async () => {
    const value = nickname;
    const nicknameError = checkFieldFormat("nickname", value);
    if (nicknameError) {
      toast.error(nicknameError);
      return;
    }

    if (value === currentNickname) {
      setOpenRename(false);
      return;
    }

    const friendId = otherUser.userId?._id;
    if (!friendId) return;

    try {
      await setNickName(friendId, value);
      setOpenRename(false);
      fetchConversations();
    } catch (error) {
      console.error("Đặt biệt danh thất bại:", error);
    }
  }

  const handleClearConversation = async () => {
    try {
      setOpenClearConfirm(false);
      await clearConversation(convo._id);
    } catch (error) {
      console.error("Xóa cuộc trò chuyện thất bại:", error);
    }
  };

  const handleToggleConversationPin = async () => {
    try {
      setPinning(true);
      await toggleConversationPin(convo._id);
      setDropdownOpen(false);
    } catch (error) {
      console.error("Cập nhật ghim hội thoại thất bại:", error);
    } finally {
      setPinning(false);
    }
  };

  const handleToggleUnread = async () => {
    try {
      if (unreadCount > 0) {
        await markAsSeen(convo._id);
      } else {
        await markAsUnread(convo._id);
      }
      setDropdownOpen(false);
    } catch (error) {
      console.error("Cập nhật trạng thái đọc thất bại:", error);
    }
  };

  const menuNode = (
    <>
      <Dialog open={openRename} onOpenChange={setOpenRename}>
        <div className="flex items-center gap-1">
          {isConversationPinned && (
            <Pin className="size-3.5 text-amber-500 fill-current shrink-0" />
          )}
          <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="p-1 rounded hover:bg-muted opacity-100 transition"
                aria-label="More actions"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="size-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align="end"
              sideOffset={6}
              onCloseAutoFocus={(e) => e.preventDefault()}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <DropdownMenuItem
                disabled={isOtherUserLocked}
                onSelect={(e) => {
                  e.preventDefault();
                  if (isOtherUserLocked) return;
                  onChangeNickname();
                }}
              >
                <PencilLine className="h-4 w-4 mr-2" />
                Đổi nickname
              </DropdownMenuItem>
              <MuteSubMenu conversationId={convo._id} />
              <DropdownMenuItem
                disabled={pinning}
                onSelect={(e) => {
                  e.preventDefault();
                  void handleToggleConversationPin();
                }}
              >
                <Pin className="h-4 w-4 mr-2" />
                {isConversationPinned ? "Bỏ ghim hội thoại" : "Ghim hội thoại"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  void handleToggleUnread();
                }}
              >
                {unreadCount > 0 ? (
                  <>
                    <MailOpen className="h-4 w-4 mr-2" />
                    Đánh dấu đã đọc
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-2" />
                    Đánh dấu chưa đọc
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={(e) => {
                  e.preventDefault();
                  setDropdownOpen(false);
                  setOpenClearConfirm(true);
                }}
              >
                <Trash2 className="size-4 mr-2" />
                Xóa cuộc trò chuyện
              </DropdownMenuItem>
              <UserActionDropdown
                userId={otherUser.userId?._id}
                displayName={displayName}
                trigger={(isBlocked) => (
                  <DropdownMenuItem
                    className={cn(
                      "gap-2",
                      isBlocked ? "text-primary focus:text-primary" : "text-destructive focus:text-destructive"
                    )}
                    onSelect={(e) => e.preventDefault()}
                  >
                    <UserX className="h-4 w-4 mr-2" />
                    {isBlocked ? "Bỏ chặn" : "Chặn"}
                  </DropdownMenuItem>
                )}
              />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={(e) => {
                  e.preventDefault();
                  setDropdownOpen(false);
                  setOpenReportUser(true);
                }}
              >
                <Flag className="h-4 w-4 mr-2" />
                Báo cáo người dùng
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <DialogContent
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>Đổi nickname</DialogTitle>
            <DialogDescription>Nickname sẽ áp dụng trong mọi cuộc trò chuyện.</DialogDescription>
          </DialogHeader>

          <Input
            value={nickname}
            onChange={(e) => setNicknameValue(e.target.value)}
            placeholder="Nhập nickname mới"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && !loading) onSubmitNickname()
            }}
          />
          <div className="text-right text-xs text-muted-foreground">
            {nickname.trim().length}/{FIELD_LIMITS.nickname}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpenRename(false)} disabled={loading}>
              Hủy
            </Button>
            <Button onClick={onSubmitNickname} disabled={loading}>
              {loading ? "Đang lưu..." : "Lưu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationModal
        isOpen={openClearConfirm}
        onClose={() => setOpenClearConfirm(false)}
        onConfirm={handleClearConversation}
        title="Xóa toàn bộ cuộc trò chuyện?"
        description="Hành động này không thể hoàn tác!"
        variant="destructive"
        confirmText="Xác nhận xóa"
      />
      <ReportDialog
        open={openReportUser}
        onOpenChange={setOpenReportUser}
        targetType="user"
        targetId={otherUser.userId._id}
        targetName={displayName}
        conversationId={convo._id}
      />
    </>
  );

  const lastMessageObj = convo.lastMessage as any;
  const lastMessageSenderId = lastMessageObj?.sender?._id || lastMessageObj?.senderId?._id || lastMessageObj?.senderId;
  const isMyLastMessage = lastMessageSenderId?.toString() === user._id.toString();


  const lastMsgId = convo.lastMessage?._id?.toString();
  const seenByOther = lastMsgId
    ? convo.participants.find((p) => {
      const pid = p.userId?._id?.toString();
      return pid && pid !== user._id.toString() && p.lastReadMessageId === lastMsgId;
    })
    : null;

  let statusIcon = null;
  if (isMyLastMessage && seenByOther) {
    statusIcon = (
      <UserAvatar
        type="seen"
        name={seenByOther.userId.displayName ?? ""}
        avatarUrl={seenByOther.userId.avatarUrl ?? undefined}
      />
    );
  }

  return (
    <ChatCard
      convoId={convo._id}
      name={displayName}
      timestamp={convo.lastMessage?.createdAt ? new Date(convo.lastMessage.createdAt) : undefined}
      isActive={active}
      onSelect={handleSelectConversation}
      unreadCount={unreadCount}
      titleAccessory={isPartiallyMuted && <span title="Đã tắt thông báo" className="flex items-center"><BellOff className="size-3.5 text-muted-foreground shrink-0" /></span>}
      rightSection={menuNode}
      statusIcon={statusIcon}
      density={density}
      leftSection={
        <>
          <UserAvatar
            type="sidebar"
            name={displayName}
            avatarUrl={otherUser.userId?.avatarUrl ?? undefined}
            className={density === "people" ? "!h-12 !w-12 !text-base" : undefined}
          />
          {onlineUsers.includes(otherUser?.userId?._id ?? "") && <StatusBadge status="online" />}
          {unreadCount > 0 && <UnreadCountBadge unreadCount={unreadCount} />}
          {unreadMentionCount > 0 && <MentionCountBadge count={unreadMentionCount} />}
        </>
      }
      subtitle={
        <div className={cn(
          "flex items-center text-sm truncate w-full",
          unreadCount > 0 ? "font-bold text-foreground" : "text-muted-foreground"
        )}>
          {(() => {
            const rawDraft = drafts[convo._id];
            if (rawDraft) {
              let draftText = typeof rawDraft === 'string' ? rawDraft : rawDraft.content;
              const draftType = typeof rawDraft === 'string' ? 'text' : rawDraft.type;

              if (draftText && draftText.trim()) {
                return (
                  <span className="flex items-center gap-1 w-full truncate">
                    <span className="text-red-500 font-bold shrink-0">[Bản nháp]:</span>
                    <span className="truncate italic">{decodeMentionTokens(draftText, convo)}</span>
                  </span>
                );
              }

              if (draftType && draftType !== 'text') {
                let DraftIcon = null;
                let label = "";

                if (draftType === 'image') {
                  DraftIcon = ImageIcon;
                  label = "Ảnh";
                } else if (draftType === 'file') {
                  DraftIcon = Paperclip;
                  label = "File";
                } else if (draftType === 'audio') {
                  DraftIcon = Mic;
                  label = "Tin nhắn thoại";
                }

                return (
                  <span className="flex items-center gap-1 w-full truncate text-red-500 font-medium">
                    <span className="font-bold shrink-0">[Bản nháp]:</span>
                    {DraftIcon && <DraftIcon className="size-3.5 shrink-0" />}
                    <span className="truncate italic">{label}</span>
                  </span>
                );
              }
            }

            if (!convo.lastMessage) return "";
            const msgObj = convo.lastMessage as any;
            const content = msgObj.content ?? "";
            const type = msgObj.type ?? "text";

            if (type === "system") {
              return <span className="truncate italic">{getSystemMessageText(msgObj, user._id)}</span>;
            }

            const prefix = isMyLastMessage ? "Bạn " : "";

            let cleanMsg = content;
            if (cleanMsg.startsWith("📎 ")) cleanMsg = cleanMsg.replace("📎 ", "");
            else if (cleanMsg.startsWith("📷 ")) cleanMsg = cleanMsg.replace("📷 ", "");
            else if (cleanMsg.startsWith("🔗 ")) cleanMsg = cleanMsg.replace("🔗 ", "");
            cleanMsg = decodeMentionTokens(cleanMsg, convo);

            let Icon = null;
            if (type === "audio") {
              Icon = Mic;
              cleanMsg = "Tin nhắn thoại";
            }
            else if (type === "sticker") {
              Icon = Sticker;
              cleanMsg = "Đã gửi một nhãn dán";
            }
            else if (type === "image" || content.includes("Đã gửi một ảnh")) Icon = ImageIcon;
            else if (type === "file" || content.startsWith("📎 ")) Icon = Paperclip;
            else if (type === "link" || content.includes("Đã gửi một liên kết") || isUrl(cleanMsg)) Icon = Link2;

            return (
              <span className="flex items-center gap-1 w-full truncate">
                {prefix && <span className="shrink-0">{prefix.trim()}:</span>}
                {Icon && <Icon className="size-3.5 shrink-0" />}
                <span className="truncate">{cleanMsg}</span>
              </span>
            );
          })()}
        </div>
      }
    />
  );
}

export default DirectMessageCard
