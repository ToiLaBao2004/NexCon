import { useChatStore } from "@/stores/useChatStore";
import { useSocketStore } from "@/stores/useSocketStore";
import { useGroupCallStore } from "@/stores/useGroupCallStore";
import ChatWelcomeScreen from "./ChatWelcomeScreen";
import ChatWindowSkeleton from "./ChatWindowSkeleton";
import { SidebarInset } from "../ui/sidebar";
import ChatWindowHeader from "./ChatWindowHeader";
import ChatWindowBody from "./ChatWindowBody";
import MessageInput from "./MessageInput";
import OngoingCallBanner from "@/components/call/OngoingCallBanner";
import MessageSearchSidebar from "./MessageSearchSidebar";
import { MutedBanner } from "./MutedBanner";
import { useEffect, useRef } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMaxWidth } from "@/hooks/use-max-width";
import { TABLET_OVERLAY_MAX_WIDTH } from "@/constants/layout";
import { useSearchParams } from "react-router";

const MAX_CACHED_CONVERSATIONS = 1;

const ChatWindowLayout = () => {
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
    setActiveSidebar,
    clearSearch,
  } = useChatStore();

  const isMobile = useIsMobile();
  const isTabletOrBelow = useMaxWidth(TABLET_OVERLAY_MAX_WIDTH);
  const useOverlayInfoSidebar = isMobile || isTabletOrBelow;
  const [searchParams, setSearchParams] = useSearchParams();


  const recentConversationIdsRef = useRef<string[]>([]);
  const deepLinkMessageIdRef = useRef<string | null>(null);

  const selectedConvo = conversations.find((c) => c._id === activeConversationId) ?? null;
  const conversationIdParam = searchParams.get('conversationId')?.trim() || '';
  const messageIdParam = searchParams.get('messageId')?.trim() || '';

  const hasLoadedMessages = (allMessages[activeConversationId!]?.items?.length ?? 0) > 0;
  const { joinConversation } = useSocketStore();

  useEffect(() => {
    if (!activeConversationId) {
      recentConversationIdsRef.current = [];
      clearConversationCache([]);
      return;
    }

    const deduped = [
      activeConversationId,
      ...recentConversationIdsRef.current.filter((id) => id !== activeConversationId),
    ];

    const keepIds = deduped.slice(0, MAX_CACHED_CONVERSATIONS);
    recentConversationIdsRef.current = keepIds;

    clearConversationCache(keepIds);
  }, [activeConversationId, clearConversationCache]);

  useEffect(() => {
    if (activeConversationId) {
      joinConversation(activeConversationId);

      if (!allMessages[activeConversationId] && !messageLoading) {
        fetchMessages(activeConversationId);
      }
    }
  }, [activeConversationId, joinConversation, fetchMessages, messageLoading]);

  useEffect(() => {
    if (!conversationIdParam) return;
    if (activeConversationId !== conversationIdParam) {
      useChatStore.getState().setActiveConversation(conversationIdParam);
    }

    if (!messageIdParam) {
      setSearchParams({}, { replace: true });
    }
  }, [activeConversationId, conversationIdParam, messageIdParam, setSearchParams]);


  useEffect(() => {
    if (!messageIdParam || !activeConversationId) return;
    if (deepLinkMessageIdRef.current === messageIdParam) return;

    const tryScroll = () => {
      const target = document.getElementById(`message-${messageIdParam}`);
      if (!target) return false;

      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.remove('animate-jump-highlight');
      void target.offsetWidth;
      target.classList.add('animate-jump-highlight');
      setTimeout(() => target.classList.remove('animate-jump-highlight'), 3000);
      
      deepLinkMessageIdRef.current = messageIdParam;
      setSearchParams({}, { replace: true });
      return true;
    };

    if (tryScroll()) return;

    const performJump = async () => {
      try {
        await useChatStore.getState().jumpToMessage(activeConversationId, messageIdParam);
        deepLinkMessageIdRef.current = messageIdParam;
        setSearchParams({}, { replace: true });
      } catch (err) {
        console.error("Deep link jump failed", err);
      }
    };

    performJump();
  }, [activeConversationId, messageIdParam, setSearchParams]);



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

  // Handle sidebar defaults when conversation changes
  useEffect(() => {
    if (activeConversationId) {
      setActiveSidebar(useOverlayInfoSidebar ? null : 'info');
      clearSearch();
    }
  }, [activeConversationId, setActiveSidebar, clearSearch]);

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

        <div className="flex-1 min-h-0 bg-primary-foreground">
          <ChatWindowBody />
        </div>

        <MessageInput selectedConvo={selectedConvo} />
      </SidebarInset>

      {/* Search panel — fullscreen overlay on mobile, side panel on desktop */}
      {activeSidebar === 'search' && (
        <MessageSearchSidebar
          onClose={() => {
            setActiveSidebar('info');
            clearSearch();
          }}
        />
      )}
    </div>
  );

};

export default ChatWindowLayout;