import { useChatStore } from "@/stores/useChatStore";
import { useSocketStore } from "@/stores/useSocketStore";
import { useCallHistoryStore } from "@/stores/useCallHistoryStore";
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
    messageLoading,
    messages: allMessages,
    markAsSeen,
    fetchMessages,
  } = useChatStore();

  const {
    loading: callHistoryLoading,
    callsByConversation,
    fetchCallsByConversation,
  } = useCallHistoryStore();

  const selectedConvo = conversations.find((c) => c._id === activeConversationId) ?? null;

  const hasLoadedMessages = (allMessages[activeConversationId!]?.items?.length ?? 0) > 0;
  const hasLoadedCalls = (callsByConversation[activeConversationId!]?.items?.length ?? 0) > 0;

  const { joinConversation } = useSocketStore();

  // Unified data fetching when active conversation changes
  useEffect(() => {
    if (activeConversationId) {
      joinConversation(activeConversationId);

      // Trigger message fetch if not already loaded and not currently loading
      if (!allMessages[activeConversationId] && !messageLoading) {
        fetchMessages(activeConversationId);
      }

      // Trigger call history fetch if not already loaded and not currently loading
      if (!callsByConversation[activeConversationId] && !callHistoryLoading) {
        fetchCallsByConversation(activeConversationId);
      }
    }
  }, [activeConversationId, joinConversation, fetchMessages, fetchCallsByConversation, messageLoading, callHistoryLoading]);

  useEffect(() => {
    if (!selectedConvo || activeConversationId !== focusedConversationId) return;
    const markSeen = async () => {
      try {
        await markAsSeen();
      } catch (error) {
        console.error("Lỗi xảy ra khi đánh dấu cuộc trò chuyện đã xem: ", error);
      }
    }

    markSeen();
  }, [markAsSeen, selectedConvo, activeConversationId, focusedConversationId]);

  if (!selectedConvo) {
    return <ChatWelcomeScreen />;
  }

  // Show skeleton if we have a conversation but either messages or calls are not loaded yet
  const messageData = allMessages[activeConversationId!];
  const callData = callsByConversation[activeConversationId!];

  const isInitialLoading = selectedConvo && (
    (!hasLoadedMessages && (messageLoading || !messageData)) ||
    (!hasLoadedCalls && (callHistoryLoading || !callData))
  );

  if (isInitialLoading) {
    return <ChatWindowSkeleton />
  }
  return (
    <SidebarInset className="flex flex-col h-full flex-1 overflow-hidden bg-transparent shadow-none border-none">
      <ChatWindowHeader chat={selectedConvo} />

      <div className="flex-1 min-h-0 bg-primary-foreground">
        <ChatWindowBody />
      </div>

      <MessageInput selectedConvo={selectedConvo} />

    </SidebarInset>
  );

};

export default ChatWindowLayout;