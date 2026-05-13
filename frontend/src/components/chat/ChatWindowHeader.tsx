import { useChatStore } from "@/stores/useChatStore";
import type { Conversation, Participant } from "@/types/chat";
import { SidebarTrigger } from "../ui/sidebar";
import { useAuthStore } from "@/stores/useAuthStore";
import { Separator } from "@radix-ui/react-separator";
import UserAvatar from "./UserAvatar";
import StatusBadge from "./StatusBadge";
import GroupChatAvatar from "./GroupChatAvatar";
import { useSocketStore } from "@/stores/useSocketStore";
import { Phone, Video, Search, ArrowLeft, CalendarClock } from "lucide-react";
import { Button } from "../ui/button";
import { UserProfileDialog } from "../shared/UserProfileDialog";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useCallStore } from "@/stores/useCallStore";
import { useGroupCallStore } from "@/stores/useGroupCallStore";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMaxWidth } from "@/hooks/use-max-width";
import { TABLET_OVERLAY_MAX_WIDTH } from "@/constants/layout";
import ScheduleMeetingModal from "@/components/reminder/ScheduleMeetingModal";

const PanelRightIcon = ({ className, filled }: { className?: string; filled?: boolean }) => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
    {filled ? (
      <path d="M15 3V21H19C20.1046 21 21 20.1046 21 19V5C21 3.89543 20.1046 3 19 3H15Z" fill="currentColor" />
    ) : (
      <line x1="15" y1="3" x2="15" y2="21" stroke="currentColor" strokeWidth="2" />
    )}
  </svg>
);

interface ChatWindowHeaderProps {
  chat?: Conversation;
  showInfo?: boolean;
  onToggleInfo?: () => void;
}

const ChatWindowHeader = ({ chat, showInfo, onToggleInfo }: ChatWindowHeaderProps) => {
  const { conversations, activeConversationId, setActiveConversation, activeSidebar, setActiveSidebar } =
    useChatStore();
  const { user } = useAuthStore();
  const { onlineUsers } = useSocketStore();
  const { startCall, status: callStatus } = useCallStore();
  const { startGroupCall, status: groupCallStatus } = useGroupCallStore();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const isMobile = useIsMobile();
  const isTabletOrBelow = useMaxWidth(TABLET_OVERLAY_MAX_WIDTH);
  const useOverlayInfoSidebar = isMobile || isTabletOrBelow;
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

  const isOtherUserLocked = Boolean(otherUser?.userId?.isLocked || otherUser?.userId?.lock?.isLocked);
  const displayName =
    chat.type === "direct"
      ? (!isOtherUserLocked && otherUser?.userId?.nickname?.trim()
        ? otherUser.userId.nickname
        : otherUser?.userId?.displayName) || "Moji"
      : chat.group?.name;

  const canCall =
    chat.type === "direct" &&
    otherUser &&
    !isOtherUserLocked &&
    callStatus === "idle" &&
    groupCallStatus === "idle";

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

  const handleToggleSearch = () => {
    if (activeSidebar !== 'search') {
      setActiveSidebar('search');
    } else {
      // Toggle off search mode. 
      // On desktop, we might want to default back to info. 
      // On mobile/tablet, we want to close it (null).
      setActiveSidebar(useOverlayInfoSidebar ? null : 'info');
    }
  };

  return (
    <header className="sticky top-0 z-10 px-2 md:px-4 py-2 flex items-center bg-background">
      <div className="flex items-center gap-1 md:gap-2 w-full">
        {/* Mobile: back button to conversation list */}
        {isMobile ? (
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 h-9 w-9 md:hidden"
            onClick={() => setActiveConversation(null)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        ) : (
          <>
            <SidebarTrigger className="-ml-1 text-foreground" />
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
          </>
        )}
        <div className="px-1 md:p-2 w-full min-w-0 flex items-center gap-2 md:gap-3">
          {/* avatar */}
          <div
            className="relative cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => chat?.type === "direct" && setIsProfileOpen(true)}
          >
            {chat.type === "direct" ? (
              <>
                <UserAvatar
                  type={"card"}
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
                type="card"
                groupAvatarUrl={chat.group?.avatarUrl}
              />
            )}
          </div>
          {/* name */}
          <h2
            className={cn(
              "font-medium text-foreground flex-1 truncate",
              chat.type === "direct" &&
              "cursor-pointer hover:text-primary transition-colors",
            )}
            onClick={() => chat?.type === "direct" && setIsProfileOpen(true)}
          >
            {displayName}
          </h2>
          <div className="flex items-center gap-0 md:gap-1 ml-0.5 md:ml-2 shrink-0">
            {/* call buttons */}
            {chat.type === "direct" && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="inline-flex rounded-md hover:bg-muted hover:text-foreground fade-in transition-colors h-8 w-8 md:h-9 md:w-9"
                  title="Lên lịch họp"
                  onClick={() => setIsScheduleOpen(true)}
                >
                  <CalendarClock className="h-[18px] w-[18px] md:h-[20px] md:w-[20px]" strokeWidth={1.5} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="inline-flex rounded-md hover:bg-muted hover:text-foreground fade-in transition-colors h-8 w-8 md:h-9 md:w-9"
                  disabled={!canCall}
                  title="Gọi thoại"
                  onClick={handleVoiceCall}
                >
                  <Phone className="h-[18px] w-[18px] md:h-[20px] md:w-[20px]" strokeWidth={1.5} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="inline-flex rounded-md hover:bg-muted hover:text-foreground fade-in transition-colors h-8 w-8 md:h-9 md:w-9"
                  disabled={!canCall}
                  title="Gọi video"
                  onClick={handleVideoCall}
                >
                  <Video className="h-[19px] w-[19px] md:h-[22px] md:w-[22px]" strokeWidth={1.5} />
                </Button>
              </>
            )}

            {/* group call button */}
            {chat.type === "group" && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="inline-flex rounded-md hover:bg-muted hover:text-foreground fade-in transition-colors h-8 w-8 md:h-9 md:w-9"
                  disabled={chat.disbanded === true}
                  title={chat.disbanded === true ? "Nhóm đã giải tán" : "Lên lịch họp"}
                  onClick={() => setIsScheduleOpen(true)}
                >
                  <CalendarClock className="h-[18px] w-[18px] md:h-[20px] md:w-[20px]" strokeWidth={1.5} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="inline-flex rounded-md hover:bg-muted hover:text-foreground fade-in transition-colors h-8 w-8 md:h-9 md:w-9"
                  disabled={groupCallStatus !== "idle" || callStatus !== "idle" || chat.disbanded === true}
                  title={chat.disbanded === true ? "Nhóm đã giải tán" : "Gọi nhóm"}
                  onClick={() => startGroupCall(chat._id, "video")}
                >
                  <Video className="h-[19px] w-[19px] md:h-[22px] md:w-[22px]" strokeWidth={1.5} />
                </Button>
              </>
            )}

            {/* Search toggle button */}
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "rounded-md transition-colors h-8 w-8 md:h-9 md:w-9",
                activeSidebar === 'search'
                  ? "bg-primary/10 text-primary hover:bg-primary/20"
                  : "hover:bg-muted hover:text-foreground"
              )}
              onClick={handleToggleSearch}
              title="Tìm kiếm trong trò chuyện"
            >
              <Search className="h-[18px] w-[18px] md:h-[20px] md:w-[20px]" strokeWidth={1.5} />
            </Button>

            {/* info toggle button */}
            {onToggleInfo && (
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "rounded-md transition-colors h-8 w-8 md:h-9 md:w-9",
                  showInfo
                    ? "bg-primary/10 text-primary hover:bg-primary/20"
                    : "hover:bg-muted hover:text-foreground"
                )}
                onClick={onToggleInfo}
                title={showInfo ? "Ẩn thông tin" : "Thông tin hội thoại"}
              >
                <PanelRightIcon className="h-5 w-5" filled={showInfo} />
              </Button>
            )}
          </div>
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

      {chat && (
        <ScheduleMeetingModal
          open={isScheduleOpen}
          onOpenChange={setIsScheduleOpen}
          conversationId={chat._id}
        />
      )}
    </header>
  );
};

export default ChatWindowHeader;
