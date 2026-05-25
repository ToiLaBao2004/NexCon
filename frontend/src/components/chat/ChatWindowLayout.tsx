import { useChatStore } from "@/stores/useChatStore";
import { useSocketStore } from "@/stores/useSocketStore";
import { useGroupCallStore } from "@/stores/useGroupCallStore";
import { useAppStatusStore } from "@/stores/useAppStatusStore";
import ChatWelcomeScreen from "./ChatWelcomeScreen";
import ChatWindowSkeleton from "./ChatWindowSkeleton";
import { SidebarInset } from "../ui/sidebar";
import ChatWindowHeader from "./ChatWindowHeader";
import ChatWindowBody from "./ChatWindowBody";
import MessageInput from "./MessageInput";
import OngoingCallBanner from "@/components/call/OngoingCallBanner";
import MessageSearchSidebar from "./MessageSearchSidebar";
import { MutedBanner } from "./MutedBanner";
import { useCallback, useEffect, useRef } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMaxWidth } from "@/hooks/use-max-width";
import { TABLET_OVERLAY_MAX_WIDTH } from "@/constants/layout";
import { useSearchParams } from "react-router";

const MAX_CACHED_CONVERSATIONS = 10;

// ChatWindowLayout is unmounted on mobile when the user goes back to the
// conversation list, so this cache list must live outside the component.
let recentConversationIds: string[] = [];
const DEEP_LINK_SCROLL_ATTEMPT_DELAYS = [0, 80, 180, 360, 700];

const scrollToMessageWithHighlight = (messageId: string) => {
  const target = document.getElementById(`message-${messageId}`);
  if (!target) return false;

  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.classList.remove('animate-jump-highlight');
  void target.offsetWidth;
  target.classList.add('animate-jump-highlight');

  window.setTimeout(() => {
    if (target.isConnected) {
      target.classList.remove('animate-jump-highlight');
    }
  }, 3000);

  return true;
};

const ChatWindowLayout = () => {
  const isOffline = useAppStatusStore((state) => state.isOffline);
  const {
    activeConversationId,
    focusedConversationId,
    conversations,
    messageLoading,
    messages: allMessages,
    markAsSeen,
    fetchMessages,
    clearConversationCache,
    activeSidebar,
    infoSidebarOpen,
    setActiveSidebar,
    clearSearch,
    jumpToMessage,
  } = useChatStore();

  const isMobile = useIsMobile();
  const isTabletOrBelow = useMaxWidth(TABLET_OVERLAY_MAX_WIDTH);
  const useOverlayInfoSidebar = isMobile || isTabletOrBelow;
  const [searchParams, setSearchParams] = useSearchParams();


  const deepLinkMessageIdRef = useRef<string | null>(null);

  const selectedConvo = conversations.find((c) => c._id === activeConversationId && c.disbanded !== true) ?? null;
  const conversationIdParam = searchParams.get('conversationId')?.trim() || '';
  const messageIdParam = searchParams.get('messageId')?.trim() || '';

  const hasLoadedMessages = (allMessages[activeConversationId!]?.items?.length ?? 0) > 0;
  const { joinConversation } = useSocketStore();
  const clearDeepLinkParams = useCallback(() => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('conversationId');
    nextParams.delete('messageId');
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    // Nếu đang offline thì không xóa cache để người dùng vẫn xem được tin nhắn cũ
    if (isOffline) return;

    if (!activeConversationId) return;

    const deduped = [
      activeConversationId,
      ...recentConversationIds.filter((id) => id !== activeConversationId),
    ];

    const keepIds = deduped.slice(0, MAX_CACHED_CONVERSATIONS);
    recentConversationIds = keepIds;

    clearConversationCache(keepIds);
  }, [activeConversationId, clearConversationCache, isOffline]);

  useEffect(() => {
    if (activeConversationId && selectedConvo?.disbanded === true) {
      useChatStore.getState().markGroupAsDisbanded(activeConversationId);
      return;
    }

    if (activeConversationId && selectedConvo) {
      joinConversation(activeConversationId);

      // Chỉ gọi fetch nếu ONLINE và chưa có tin nhắn, hoặc nếu bắt buộc phải load
      if (!allMessages[activeConversationId] && !messageLoading && !isOffline) {
        fetchMessages(activeConversationId);
      }
    }

  }, [activeConversationId, conversationIdParam, messageIdParam, setSearchParams]);


  useEffect(() => {
    if (!messageIdParam) {
      deepLinkMessageIdRef.current = null;
    }
  }, [messageIdParam]);

  useEffect(() => {
    if (!messageIdParam && conversationIdParam && activeConversationId === conversationIdParam) {
      clearDeepLinkParams();
    }
  }, [activeConversationId, clearDeepLinkParams, conversationIdParam, messageIdParam]);

  useEffect(() => {
    if (!messageIdParam || !activeConversationId) return;
    if (conversationIdParam && activeConversationId !== conversationIdParam) return;

    const requestKey = `${activeConversationId}:${messageIdParam}`;
    if (deepLinkMessageIdRef.current === requestKey) return;

    let cancelled = false;
    let completed = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const finish = () => {
      if (cancelled || completed) return;
      completed = true;
      clearDeepLinkParams();
    };

    const tryScroll = () => {
      if (cancelled || completed) return false;
      const didScroll = scrollToMessageWithHighlight(messageIdParam);
      if (didScroll) finish();
      return didScroll;
    };

    const scheduleScrollAttempts = () => {
      DEEP_LINK_SCROLL_ATTEMPT_DELAYS.forEach((delay) => {
        const timer = window.setTimeout(tryScroll, delay);
        timers.push(timer);
      });
    };

    deepLinkMessageIdRef.current = requestKey;

    if (!tryScroll()) {
      const performJump = async () => {
        try {
          await jumpToMessage(activeConversationId, messageIdParam);
          scheduleScrollAttempts();
        } catch (err) {
          deepLinkMessageIdRef.current = null;
          console.error("Deep link jump failed", err);
        }
      };

      void performJump();
    }

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [activeConversationId, clearDeepLinkParams, conversationIdParam, jumpToMessage, messageIdParam]);



  useEffect(() => {
    if (!activeConversationId || activeConversationId !== focusedConversationId) return;
    const markSeen = async () => {
      try {
        await markAsSeen();
      } catch (error) {
        console.error("Lỗi xảy ra khi đánh dấu cuộc trò chuyện đã xem: ", error);
      }
    }

    markSeen();
  }, [markAsSeen, activeConversationId, focusedConversationId]);

  // Check if there's an active group call when opening a group conversation
  useEffect(() => {
    if (activeConversationId && selectedConvo?.type === "group") {
      useGroupCallStore.getState().checkGroupCallStatus(activeConversationId);
    }
  }, [activeConversationId, selectedConvo?.type]);

  // Preserve the user's info-sidebar preference when conversation changes.
  useEffect(() => {
    if (!activeConversationId) return;

    clearSearch();

    const {
      activeSidebar: currentSidebar,
      infoSidebarOpen: shouldShowInfoSidebar,
    } = useChatStore.getState();

    if (currentSidebar === 'search') {
      setActiveSidebar(!useOverlayInfoSidebar && shouldShowInfoSidebar ? 'info' : null);
      return;
    }

    if (!useOverlayInfoSidebar && shouldShowInfoSidebar && currentSidebar !== 'info') {
      setActiveSidebar('info');
    }
  }, [activeConversationId, useOverlayInfoSidebar, setActiveSidebar, clearSearch]);

  if (!selectedConvo) {
    return <ChatWelcomeScreen />;
  }

  const messageData = allMessages[activeConversationId!];
  const isInitialLoading = selectedConvo && (
    !hasLoadedMessages && (messageLoading || !messageData)
  );

  if (isInitialLoading) {
    return <ChatWindowSkeleton />
  }

  return (
    <div className="flex h-full flex-1 overflow-hidden relative">
      <SidebarInset className="flex flex-col h-full flex-1 overflow-hidden bg-transparent shadow-none border-none min-w-0">
        <ChatWindowHeader
          chat={selectedConvo}
          showInfo={activeSidebar === 'info'}
          onToggleInfo={() => {
            if (activeSidebar !== 'info') {
              setActiveSidebar('info');
            } else {
              setActiveSidebar(null);
            }
          }}
        />

        {selectedConvo.type === "group" && activeConversationId && (
          <OngoingCallBanner conversationId={activeConversationId} />
        )}
        <MutedBanner />

        <div className="flex-1 min-h-0 bg-chat-surface">
          <ChatWindowBody />
        </div>

        <MessageInput selectedConvo={selectedConvo} />
      </SidebarInset>

      {/* Search panel — fullscreen overlay on mobile, side panel on desktop */}
      {activeSidebar === 'search' && (
        <MessageSearchSidebar
          onClose={() => {
            setActiveSidebar(!useOverlayInfoSidebar && infoSidebarOpen ? 'info' : null);
            clearSearch();
          }}
        />
      )}
    </div>
  );

};

export default ChatWindowLayout;
