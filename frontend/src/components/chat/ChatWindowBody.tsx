import { useChatStore } from "@/stores/useChatStore";
import ChatWelcomeScreen from "./ChatWelcomeScreen";
import MessageItem from "./MessageItem";
import { useEffect, useRef } from "react";
import { useAuthStore } from "@/stores/useAuthStore";

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number>(0);
  const prevMessageCount = useRef(0);
  const isFirstLoad = useRef(true);

  const lastMessageId = messages[messages.length - 1]?._id;
  useEffect(() => {
    if (isFirstLoad.current) {
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
      isFirstLoad.current = false;
    } else {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [lastMessageId]);

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

  if (!messages?.length) {
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
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

export default ChatWindowBody;
