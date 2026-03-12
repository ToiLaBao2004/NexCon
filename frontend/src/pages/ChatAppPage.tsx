import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import ChatWindowLayout from "@/components/chat/ChatWindowLayout";
import ConversationInfoSidebar from "@/components/chat/ConversationInfoSidebar";
import { useChatStore } from "@/stores/useChatStore";
import { useState } from "react";

const ChatAppPage = () => {
  const { activeConversationId, conversations } = useChatStore();
  const [showInfo, setShowInfo] = useState(true);

  const selectedConvo = conversations.find((c) => c._id === activeConversationId) ?? null;

  return (
    <SidebarProvider
      style={{ "--sidebar-width": "300px" } as React.CSSProperties}
      className="flex h-full w-full relative min-h-0"
    >
      <AppSidebar
        className="
          md:left-20 
          top-2 bottom-2 
          h-[calc(100vh-16px)]
          bg-card/20
          backdrop-blur
          border border-border/40
          rounded-2xl
        "
      />
      <main className="flex-1 min-w-0 bg-card rounded-2xl overflow-hidden shadow-soft border border-border/40 ml-2 h-full flex">
        {/* Chat area – passes toggle fn down */}
        <div className="flex-1 min-w-0 flex flex-col">
          <ChatWindowLayout showInfo={showInfo} onToggleInfo={() => setShowInfo((v) => !v)} />
        </div>

        {/* Right info sidebar */}
        {showInfo && selectedConvo && (
          <div className="w-[340px] shrink-0 border-l border-border/40 overflow-hidden bg-card/10">
            <ConversationInfoSidebar conversation={selectedConvo} />
          </div>
        )}
      </main>
    </SidebarProvider>
  );
};

export default ChatAppPage;