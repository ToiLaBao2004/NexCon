import { useChatStore } from "@/stores/useChatStore";
import type { Conversation, Participant } from "@/types/chat";
import { SidebarTrigger } from "../ui/sidebar";
import { useAuthStore } from "@/stores/useAuthStore";
import { Separator } from "@radix-ui/react-separator";
import UserAvatar from "./UserAvatar";
import StatusBadge from "./StatusBadge";
import GroupChatAvatar from "./GroupChatAvatar";
import { useSocketStore } from "@/stores/useSocketStore";
import { Phone, Video, X } from "lucide-react";
import { Button } from "../ui/button";
import { UserProfileDialog } from "../shared/UserProfileDialog";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useCallStore } from "@/stores/useCallStore";

const ChatWindowHeader = ({ chat }: { chat?: Conversation }) => {
  const { conversations, activeConversationId, setActiveConversation } =
    useChatStore();
  const { user } = useAuthStore();
  const { onlineUsers } = useSocketStore();
  const { startCall, status: callStatus } = useCallStore();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  let otherUser: Participant | null | undefined;

  chat = chat ?? conversations.find((c) => c._id === activeConversationId);

  if (!chat) {
    return (
      <header
        className="md:hidden sticky top-0 z-10 flex items-center gap-2 px-4 py-2
            w-full "
      >
        <SidebarTrigger className="-ml-1 text-foreground" />
      </header>
    );
  }

  if (chat?.type === "direct") {
    const otherUsers = chat.participants.filter(
      (p) => p.userId?._id?.toString() !== user?._id.toString(),
    );
    otherUser = otherUsers.length > 0 ? otherUsers[0] : null;

    if (!user || !otherUser) return;
  }

  const displayName =
    chat.type === "direct"
      ? (otherUser?.userId?.nickname?.trim()
        ? otherUser.userId.nickname
        : otherUser?.userId?.displayName) || "Moji"
      : chat.group?.name;

  const canCall = chat.type === "direct" && otherUser && callStatus === "idle";

  const handleVoiceCall = () => {
    if (!canCall || !otherUser) return;
    startCall(
      {
        _id: otherUser.userId._id,
        displayName: otherUser.userId.displayName,
        avatarUrl: otherUser.userId.avatarUrl ?? null,
      },
      "voice",
    );
  };

  const handleVideoCall = () => {
    if (!canCall || !otherUser) return;
    startCall(
      {
        _id: otherUser.userId._id,
        displayName: otherUser.userId.displayName,
        avatarUrl: otherUser.userId.avatarUrl ?? null,
      },
      "video",
    );
  };

  return (
    <header className="sticky top-0 z-10 px-4 py-2 flex items-center bg-background">
      <div className="flex items-center gap-2 w-full">
        <SidebarTrigger className="-ml-1 text-foreground" />
        <Separator
          orientation="vertical"
          className="mr-2 data-[orientation=vertical]:h-4"
        />
        <div className="p-2 w-full flex items-center gap-3">
          {/* avatar */}
          <div
            className="relative cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => chat?.type === "direct" && setIsProfileOpen(true)}
          >
            {chat.type === "direct" ? (
              <>
                <UserAvatar
                  type={"sidebar"}
                  name={displayName}
                  avatarUrl={otherUser?.userId?.avatarUrl || undefined}
                />
                {onlineUsers.includes(otherUser?.userId?._id ?? "") && (
                  <StatusBadge status="online" />
                )}
              </>
            ) : (
              <GroupChatAvatar
                participants={chat.participants}
                type="sidebar"
              />
            )}
          </div>
          {/* name */}
          <h2
            className={cn(
              "font-medium text-foreground flex-1",
              chat.type === "direct" &&
              "cursor-pointer hover:text-primary transition-colors",
            )}
            onClick={() => chat?.type === "direct" && setIsProfileOpen(true)}
          >
            {displayName}
          </h2>
          {/* call buttons */}
          {chat.type === "direct" && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full hover:bg-primary/10 hover:text-primary"
                disabled={!canCall}
                title="Gọi thoại"
                onClick={handleVoiceCall}
              >
                <Phone className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full hover:bg-primary/10 hover:text-primary"
                disabled={!canCall}
                title="Gọi video"
                onClick={handleVideoCall}
              >
                <Video className="h-5 w-5" />
              </Button>
            </>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="rounded-full hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setActiveConversation(null)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {chat.type === "direct" && otherUser && (
        <UserProfileDialog
          open={isProfileOpen}
          onOpenChange={setIsProfileOpen}
          user={{
            _id: otherUser.userId._id,
            displayName: otherUser.userId.displayName,
            email: otherUser.userId.email || "",
            avatarUrl: otherUser.userId.avatarUrl || undefined,
            bio: otherUser.userId.bio,
            phone: otherUser.userId.phone,
          }}
          onOpenChat={() => setIsProfileOpen(false)}
        />
      )}
    </header>
  );
};

export default ChatWindowHeader;
