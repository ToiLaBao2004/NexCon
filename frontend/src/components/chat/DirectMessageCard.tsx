import type { Conversation } from '@/types/chat'
import ChatCard from './ChatCard'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChatStore } from '@/stores/useChatStore';
import { useFriendStore } from '@/stores/useFriendStore';
import { cn } from '@/lib/utils';
import UserAvatar from './UserAvatar';
import StatusBadge from './StatusBadge';
import UnreadCountBadge from './UnreadCountBadge';
import { useSocketStore } from '@/stores/useSocketStore';
import { MoreHorizontal, PencilLine, UserX, Paperclip, Image as ImageIcon, Link2, Trash2, Pin } from "lucide-react";
import { isUrl } from '@/lib/utils';
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

const DirectMessageCard = ({ convo }: { convo: Conversation }) => {
  const { user } = useAuthStore();
  const { focusedConversationId, setActiveConversation, messages, fetchMessages, fetchConversations, clearConversation, toggleConversationPin } = useChatStore();
  const { onlineUsers } = useSocketStore();
  const { setNickName, loading } = useFriendStore();
  const active = focusedConversationId === convo._id;

  const [openRename, setOpenRename] = useState(false);
  const [nickname, setNicknameValue] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [openClearConfirm, setOpenClearConfirm] = useState(false);
  const [pinning, setPinning] = useState(false);

  const isConversationPinned = convo.isPinned === true;

  const currentNickname = useMemo(() => {
    const otherUser = convo.participants.find((p) => p.userId?._id?.toString() !== user?._id?.toString());
    return otherUser?.userId?.nickname ?? "";
  }, [convo.participants, user?._id]);

  useEffect(() => {
    if (openRename) {
      setNicknameValue(currentNickname);
    }
  }, [openRename, currentNickname]);

  if (!user) return null;

  const otherUser = convo.participants.find((p) => p.userId?._id?.toString() !== user._id.toString());
  if (!otherUser) return null;

  const displayName = otherUser?.userId?.nickname?.trim()
    ? otherUser.userId.nickname
    : otherUser?.userId?.displayName ?? "";

  const unreadCount = convo.unreadCounts[user._id];

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
                onSelect={(e) => {
                  e.preventDefault();
                  onChangeNickname();
                }}
              >
                <PencilLine className="h-4 w-4 mr-2" />
                Đổi nickname
              </DropdownMenuItem>
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
                    <UserX className="h-4 w-4" />
                    {isBlocked ? "Bỏ chặn" : "Chặn"}
                  </DropdownMenuItem>
                )}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <DialogContent
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>Đổi nickname</DialogTitle>
            <DialogDescription>Nickname chỉ áp dụng trong cuộc chat này.</DialogDescription>
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
    </>
  );

  const lastMessageObj = convo.lastMessage as any;
  const lastMessageSenderId = lastMessageObj?.sender?._id || lastMessageObj?.senderId?._id || lastMessageObj?.senderId;
  const isMyLastMessage = lastMessageSenderId?.toString() === user._id.toString();

  const seenByOthers = convo.seenBy?.filter(
    (s: any) => (typeof s === "string" ? s : s._id?.toString()) !== user._id.toString()
  ) ?? [];

  let statusIcon = null;
  if (isMyLastMessage && seenByOthers.length > 0) {
    const seenId = seenByOthers[0];
    const seenUserId = typeof seenId === "string" ? seenId : seenId._id?.toString();
    const seenParticipant = convo.participants.find(
      (p) => p.userId?._id?.toString() === seenUserId
    );
    if (seenParticipant) {
      statusIcon = (
        <UserAvatar
          type="seen"
          name={seenParticipant.userId.displayName ?? ""}
          avatarUrl={seenParticipant.userId.avatarUrl ?? undefined}
        />
      );
    }
  }

  return (
    <ChatCard
      convoId={convo._id}
      name={displayName}
      timestamp={convo.lastMessage?.createdAt ? new Date(convo.lastMessage.createdAt) : undefined}
      isActive={active}
      onSelect={handleSelectConversation}
      unreadCount={unreadCount}
      rightSection={menuNode}
      statusIcon={statusIcon}
      leftSection={
        <>
          <UserAvatar
            type="sidebar"
            name={displayName}
            avatarUrl={otherUser.userId?.avatarUrl ?? undefined}
          />
          {onlineUsers.includes(otherUser?.userId?._id ?? "") && <StatusBadge status="online" />}
          {unreadCount > 0 && <UnreadCountBadge unreadCount={unreadCount} />}
        </>
      }
      subtitle={
        <div className={cn(
          "flex items-center text-sm truncate w-full",
          unreadCount > 0 ? "font-bold text-foreground" : "text-muted-foreground"
        )}>
          {(() => {
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

            let Icon = null;
            if (type === "image" || content.includes("Đã gửi một ảnh")) Icon = ImageIcon;
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