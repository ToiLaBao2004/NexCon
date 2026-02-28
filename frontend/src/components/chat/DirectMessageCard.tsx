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
import { MoreHorizontal } from "lucide-react";
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
import { useState } from "react";

const DirectMessageCard = ({ convo }: { convo: Conversation }) => {
  const { user } = useAuthStore();
  const { activeConversationId, setActiveConversation, messages, fetchMessages, fetchConversations } = useChatStore();
  const { onlineUsers } = useSocketStore();
  const { setNickName, loading } = useFriendStore();

  const [openRename, setOpenRename] = useState(false);
  const [nickname, setNicknameValue] = useState("");

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
      await fetchMessages();
    }
  }

  const onChangeNickname = () => {
    setNicknameValue("")
    setOpenRename(true);
  };
  const onSubmitNickname = async () => {
    const value = nickname.trim()
    if (!value) return
    const friendId = otherUser.userId?._id;
    if (!friendId) return;

    try {
      await setNickName(friendId, value);
      console.log("Nickname updated successfully");
      setOpenRename(false);
      setNicknameValue("");
      fetchConversations(); // Refresh conversations list to update nickname display
    } catch (error) {
      console.error("Set nickname failed:", error);
    }
    setOpenRename(false)
  }

  const menuNode = (
    <Dialog open={openRename} onOpenChange={setOpenRename}>
      <DropdownMenu>
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
              onChangeNickname();
            }}
          >
            Đổi nickname
          </DropdownMenuItem>

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
            if (e.key === "Enter") onSubmitNickname()
          }}
        />

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpenRename(false)}>
            Hủy
          </Button>
          <Button onClick={onSubmitNickname} disabled={!nickname.trim() || loading}>
            {loading ? "Đang lưu..." : "Lưu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return <ChatCard
    convoId={convo._id}
    name={displayName}
    timestamp={
      convo.lastMessage?.createdAt ? new Date(convo.lastMessage.createdAt) : undefined
    }
    isActive={activeConversationId === convo._id}
    onSelect={handleSelectConversation}
    unreadCount={unreadCount}
    rightSection={menuNode}
    leftSection={
      <>
        <UserAvatar type="sidebar" name={displayName}
          avatarUrl={otherUser.userId?.avatarUrl ?? undefined}
        />
        { /* todo: socket io */}
        {onlineUsers.includes(otherUser?.userId?._id ?? "") && (
          <StatusBadge status="online" />)}
        {unreadCount > 0 && <UnreadCountBadge unreadCount={unreadCount} />}
      </>
    }
    subtitle={
      <p className={cn(
        "text-sm truncate",
        unreadCount > 0 ? "font-medium text-foreground" : "text-muted-foreground"
      )}
      >
        {lastMessage}
      </p>

    }

  />;
}

export default DirectMessageCard