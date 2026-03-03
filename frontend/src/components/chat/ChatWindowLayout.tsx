import { useChatStore } from "@/stores/useChatStore";
import { useSocketStore } from "@/stores/useSocketStore";
import ChatWelcomeScreen from "./ChatWelcomeScreen";
import ChatWindowSkeleton from "./ChatWindowSkeleton";
import { SidebarInset } from "../ui/sidebar";
import ChatWindowHeader from "./ChatWindowHeader";
import ChatWindowBody from "./ChatWindowBody";
import MessageInput from "./MessageInput";
import { useEffect } from "react";

const ChatWindowLayout = () => {
  const {
    activeConversationId,
    focusedConversationId,
    conversations,
    messageLoading: loading,
    messages: allMessages,
    markAsSeen,
  } = useChatStore();

  const selectedConvo = conversations.find((c) => c._id === activeConversationId) ?? null;

  const hasLoadedMessages = (allMessages[activeConversationId!]?.items?.length ?? 0) > 0;

  const { joinConversation } = useSocketStore();

  useEffect(() => {
    if (activeConversationId) {
      joinConversation(activeConversationId);
    }
  }, [activeConversationId, joinConversation]);

  useEffect(() => {
    if (!selectedConvo || activeConversationId !== focusedConversationId) return;
    const markSeen = async () => {
      try {
        await markAsSeen();
      } catch (error) {
        console.error("An error occurred while marking conversation as seen: ", error);
      }
    }

    markSeen();
  }, [markAsSeen, selectedConvo, activeConversationId, focusedConversationId]);

  if (!selectedConvo) {
    return <ChatWelcomeScreen />;
  }

  if (loading && !hasLoadedMessages) {
    return <ChatWindowSkeleton />
  }
  return (
    <SidebarInset className="flex flex-col h-full flex-1 overflow-hidden bg-transparent shadow-none border-none">
      {/* Header */}
      <ChatWindowHeader chat={selectedConvo} />

      {/* Body */}
      <div className="flex-1 overflow-y-auto 
    bg-priamry-foreground">
        <ChatWindowBody />

      </div>

      {/* Footer */}
      <MessageInput selectedConvo={selectedConvo} />

    </SidebarInset>
  );

};

export default ChatWindowLayout;