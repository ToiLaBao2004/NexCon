import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import ChatWindowLayout from "@/components/chat/ChatWindowLayout";
import ConversationInfoSidebar from "@/components/chat/ConversationInfoSidebar";
import { useChatStore } from "@/stores/useChatStore";
import { useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMaxWidth } from "@/hooks/use-max-width";
import type { Conversation } from "@/types/chat";
import {
  APP_SHELL_GAP_PX,
  APP_SIDEBAR_WIDTH_PX,
  MAIN_SIDEBAR_WIDTH_REM,
  TABLET_OVERLAY_MAX_WIDTH,
} from "@/constants/layout";

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
  const { state: sidebarState } = useSidebar();

  const selectedConvo = conversations.find((c) => c._id === activeConversationId && c.disbanded !== true) ?? null;
  const useOverlayInfoSidebar = isMobile || isTabletOrBelow;

  // Mobile: show conversation list when no active chat
  const showConversationList = !isMobile || !selectedConvo;
  const showChatWindow = !isMobile || !!selectedConvo;
  const tabletOverlayStyle = useMemo<React.CSSProperties>(() => {
    const appSidebarOffset = sidebarState === "expanded" ? APP_SIDEBAR_WIDTH_PX : 0;
    const left = `calc(${MAIN_SIDEBAR_WIDTH_REM}rem + ${appSidebarOffset}px + ${APP_SHELL_GAP_PX}px)`;
    return { left };
  }, [sidebarState]);

  return (
    <>
      {showConversationList && (
        <AppSidebar
          collapsible={isMobile ? "none" : "offcanvas"}
          className={`
            md:left-[72px]
            top-0 md:top-2 bottom-0 md:bottom-2 
            ${isMobile ? 'h-full w-full' : 'h-[calc(100vh-16px)]'}
            bg-card
            border-0 md:border-y md:border-r md:border-l-0 md:border-border/50
            rounded-none
            shadow-none
          `}
        />
      )}

      {showChatWindow && (
        <main className="flex-1 min-w-0 bg-card rounded-none md:rounded-l-none md:rounded-r-2xl overflow-hidden shadow-none border-0 md:border-y md:border-r md:border-l-0 md:border-border/50 h-full flex">
          <div className="flex-1 min-w-0 flex flex-col">
            <ChatWindowLayout />
          </div>

          {/* Right info sidebar – hidden on mobile, full-screen overlay handled separately */}
          {!useOverlayInfoSidebar && showInfo && selectedConvo && (
            <div className="w-[350px] shrink-0 border-l border-border/40 overflow-hidden bg-card/10">
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
              : "fixed top-2 right-2 bottom-2 z-50 flex flex-col bg-background overflow-hidden rounded-2xl border border-border/40 shadow-soft"
          }
          style={isMobile ? undefined : tabletOverlayStyle}
        >
          <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-3 bg-card border-b border-border/40">
            <button
              onClick={() => setShowSidebar(null)}
              className="text-foreground p-1"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
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
  const { activeConversationId, conversations, activeSidebar, setActiveSidebar } = useChatStore();
  const isMobile = useIsMobile();
  const isTabletOrBelow = useMaxWidth(TABLET_OVERLAY_MAX_WIDTH);

  const showInfo = activeSidebar === 'info';

  return (
    <SidebarProvider
      style={{ "--sidebar-width": "300px" } as React.CSSProperties}
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
