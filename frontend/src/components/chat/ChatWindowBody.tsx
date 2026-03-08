import { useChatStore } from "@/stores/useChatStore";
import ChatWelcomeScreen from "./ChatWelcomeScreen";
import MessageItem from "./MessageItem";
import { useEffect, useRef } from "react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useSocketStore } from "@/stores/useSocketStore";

const ChatWindowBody = () => {
  const {
    activeConversationId,
    conversations,
    messages: allMessages,
    fetchMessages,
    messageLoading,
  } = useChatStore();
  const messages = allMessages[activeConversationId!]?.items ?? [];
  const messageData = allMessages[activeConversationId!];
  const hasMore = messageData?.hasMore ?? false;
  const selectedConvo = conversations.find(
    (c) => c._id === activeConversationId,
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const { user } = useAuthStore();
  const { typingUsers } = useSocketStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number>(0);
  const prevMessageCount = useRef(0);
  const isFirstLoad = useRef(true);

  const lastMessageId = messages[messages.length - 1]?._id;
  const activeTypingUserIds = typingUsers[activeConversationId!]?.filter(id => id !== user?._id) || [];
  const activeTypingParticipants = activeTypingUserIds.map(id => selectedConvo?.participants.find(p => p.userId?._id?.toString() === id));

  useEffect(() => {
    if (isFirstLoad.current) {
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
      isFirstLoad.current = false;
    } else {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [lastMessageId, activeTypingUserIds.length]);

  useEffect(() => {
    isFirstLoad.current = true;
  }, [activeConversationId]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    if (
      messages.length > prevMessageCount.current &&
      prevMessageCount.current > 0
    ) {
      const newScrollHeight = container.scrollHeight;
      container.scrollTop = newScrollHeight - prevScrollHeightRef.current;
    }

    prevMessageCount.current = messages.length;
  }, [messages.length]);

  const handleScroll = () => {
    const container = scrollRef.current;
    if (!container) return;

    if (container.scrollTop < 100 && hasMore && !messageLoading) {
      prevScrollHeightRef.current = container.scrollHeight;
      fetchMessages();
    }
  };

  if (!selectedConvo) {
    return <ChatWelcomeScreen />;
  }

  if (!messages?.length && activeTypingUserIds.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Chưa có tin nhắn nào trong cuộc trò chuyện này!
      </div>
    );
  }

  return (
    <div className="p-4 bg-primary-foreground h-full flex flex-col overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex flex-col overflow-y-auto overflow-x-hidden beautiful-scrollbar"
      >
        {messageLoading && hasMore && (
          <div className="flex justify-center py-2 text-sm text-muted-foreground">
            Đang tải...
          </div>
        )}
        {messages.map((message, index) => (
          <MessageItem
            key={message._id ?? index}
            message={message}
            index={index}
            messages={messages}
            selectedConvo={selectedConvo}
            currentUserId={user?._id ?? ""}
          />
        ))}
        {activeTypingParticipants.length > 0 && (
          <div className="flex gap-2 mx-2 px-1 mt-0.5 justify-start">
            <div className="w-8 shrink-0 pt-0.5" />
            <div className="px-3.5 py-2.5 text-sm bg-gray-100 dark:bg-gray-800 text-foreground rounded-2xl rounded-bl-none shadow-sm border-0 flex items-center gap-1">
              <span className="flex gap-1 items-center h-5">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span>
              </span>
              <span className="ml-2 text-xs italic text-muted-foreground hidden sm:inline">
                {activeTypingParticipants.map(p => p?.userId?.displayName || "Ai đó").join(", ")} đang soạn tin nhắn...
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

export default ChatWindowBody;
