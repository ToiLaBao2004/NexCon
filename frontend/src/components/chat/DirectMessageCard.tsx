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
import { MoreHorizontal, UserX } from "lucide-react";
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

const DirectMessageCard = ({ convo }: { convo: Conversation }) => {
  const { user } = useAuthStore();
  const { focusedConversationId, setActiveConversation, messages, fetchMessages, fetchConversations } = useChatStore();
  const { onlineUsers } = useSocketStore();
  const { setNickName, loading } = useFriendStore();
  const active = focusedConversationId === convo._id;

  const [openRename, setOpenRename] = useState(false);
  const [nickname, setNicknameValue] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const currentNickname = useMemo(() => {
    const otherUser = convo.participants.find((p) => p.userId?._id?.toString() !== user?._id?.toString());
    return otherUser?.userId?.nickname?.trim() ?? "";
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
  const lastMessage = convo.lastMessage?.content ?? "";

  const handleSelectConversation = async (id: string) => {
    setActiveConversation(id);

    if (!messages[id]) {
      await fetchMessages(id);
    }
  };
  const onChangeNickname = () => {
    setOpenRename(true);
  };

  const onSubmitNickname = async () => {
    const value = nickname.trim()

    if (value === currentNickname.trim()) {
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

  const menuNode = (
    <Dialog open={openRename} onOpenChange={setOpenRename}>
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="p-1 rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition"
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
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setDropdownOpen(false);
              onChangeNickname();
            }}
          >
            Đổi nickname
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
  );

  return (
    <ChatCard
      convoId={convo._id}
      name={displayName}
      timestamp={convo.lastMessage?.createdAt ? new Date(convo.lastMessage.createdAt) : undefined}
      isActive={active}
      onSelect={handleSelectConversation}
      unreadCount={unreadCount}
      rightSection={menuNode}
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
        <p className={cn(
          "text-sm truncate",
          unreadCount > 0 ? "font-medium text-foreground" : "text-muted-foreground"
        )}>
          {lastMessage}
        </p>
      }
    />
  );
}

export default DirectMessageCard