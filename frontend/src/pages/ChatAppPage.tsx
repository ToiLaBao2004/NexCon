import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import ChatWindowLayout from "@/components/chat/ChatWindowLayout";
import ConversationInfoSidebar from "@/components/chat/ConversationInfoSidebar";
import { useChatStore } from "@/stores/useChatStore";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMaxWidth } from "@/hooks/use-max-width";
import type { Conversation } from "@/types/chat";
import { TABLET_OVERLAY_MAX_WIDTH } from "@/constants/layout";
import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router";

interface ChatAppPageContentProps {
  activeConversationId: string | null;
  conversations: Conversation[];
  showInfo: boolean;
  setShowSidebar: (sidebar: 'search' | 'info' | null) => void;
  isMobile: boolean;
  isTabletOrBelow: boolean;
}

const ChatAppPageContent = ({
  activeConversationId,
  conversations,
  showInfo,
  setShowSidebar,
  isMobile,
  isTabletOrBelow,
}: ChatAppPageContentProps) => {
  const selectedConvo = conversations.find((c) => c._id === activeConversationId && c.disbanded !== true) ?? null;
  const useOverlayInfoSidebar = isMobile || isTabletOrBelow;

  // Mobile: show conversation list when no active chat
  const showConversationList = !isMobile || !selectedConvo;
  const showChatWindow = !isMobile || !!selectedConvo;

  return (
    <>
      {showConversationList && (
        <AppSidebar
          collapsible={isMobile ? "none" : "offcanvas"}
          className={`
            md:left-16 md:group-data-[collapsible=offcanvas]:left-[calc(4rem-var(--sidebar-width))]
            top-0 bottom-0 
            ${isMobile ? 'h-full w-full' : 'h-full'}
            bg-card
            border-0 md:border-r md:border-border/80
            rounded-none
            shadow-none
          `}
        />
      )}

      {showChatWindow && (
        <main className="flex-1 min-w-0 bg-card rounded-none overflow-hidden shadow-none border-0 h-full flex">
          <div className="flex-1 min-w-0 flex flex-col">
            <ChatWindowLayout />
          </div>

          {/* Right info sidebar – hidden on mobile, full-screen overlay handled separately */}
          {!useOverlayInfoSidebar && showInfo && selectedConvo && (
            <div className="w-[380px] shrink-0 border-l border-border/70 overflow-hidden bg-card">
              <ConversationInfoSidebar conversation={selectedConvo} />
            </div>
          )}
        </main>
      )}

      {/* Mobile/Tablet info sidebar overlay */}
      {useOverlayInfoSidebar && showInfo && selectedConvo && (
        <div
          className={
            isMobile
              ? "fixed inset-0 z-50 flex flex-col bg-background overflow-hidden"
              : "fixed inset-y-0 right-0 z-50 flex w-full max-w-[380px] flex-col overflow-hidden border-l border-border/40 bg-background shadow-2xl"
          }
        >
          <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-3 bg-card border-b border-border/40">
            <button
              onClick={() => setShowSidebar(null)}
              className="text-foreground p-1"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <span className="font-semibold text-foreground">Thông tin hội thoại</span>
          </div>
          <div className="flex-1 min-h-0">
            <ConversationInfoSidebar conversation={selectedConvo} />
          </div>
        </div>
      )}
    </>
  );
};

const ChatAppPage = () => {
  const {
    activeConversationId,
    conversations,
    activeSidebar,
    ensureConversation,
    setActiveConversation,
    setActiveSidebar,
  } = useChatStore();
  const isMobile = useIsMobile();
  const isTabletOrBelow = useMaxWidth(TABLET_OVERLAY_MAX_WIDTH);
  const [searchParams] = useSearchParams();
  const openingDeepLinkConversationRef = useRef<string | null>(null);

  const showInfo = activeSidebar === 'info';
  const deepLinkConversationId = searchParams.get('conversationId')?.trim() || '';

  useEffect(() => {
    if (!deepLinkConversationId || activeConversationId === deepLinkConversationId) {
      return;
    }
    if (openingDeepLinkConversationRef.current === deepLinkConversationId) {
      return;
    }

    let cancelled = false;
    openingDeepLinkConversationRef.current = deepLinkConversationId;

    const openDeepLinkConversation = async () => {
      const conversation = await ensureConversation(deepLinkConversationId);
      if (cancelled) return;

      if (conversation) {
        setActiveConversation(deepLinkConversationId);
      }

      openingDeepLinkConversationRef.current = null;
    };

    void openDeepLinkConversation();

    return () => {
      cancelled = true;
      if (openingDeepLinkConversationRef.current === deepLinkConversationId) {
        openingDeepLinkConversationRef.current = null;
      }
    };
  }, [activeConversationId, deepLinkConversationId, ensureConversation, setActiveConversation]);

  return (
    <SidebarProvider
      style={{ "--sidebar-width": "340px" } as React.CSSProperties}
      className="flex h-full w-full relative min-h-0"
    >
      <ChatAppPageContent
        activeConversationId={activeConversationId}
        conversations={conversations}
        showInfo={showInfo}
        setShowSidebar={setActiveSidebar}
        isMobile={isMobile}
        isTabletOrBelow={isTabletOrBelow}
      />
    </SidebarProvider>
  );
};

export default ChatAppPage;
