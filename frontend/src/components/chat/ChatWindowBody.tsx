import React from "react";
import { useChatStore } from "@/stores/useChatStore";
import ChatWelcomeScreen from "./ChatWelcomeScreen";
import MessageItem from "./MessageItem";
import CallMessageItem from "./CallMessageItem";
import { PinnedMessagesBanner } from "@/components/chat/PinnedMessagesBanner";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useSocketStore } from "@/stores/useSocketStore";

const ChatWindowBody: React.FC = () => {
  const {
    activeConversationId,
    conversations,
    messages: allMessages,
    fetchMessages,
    messageLoading,
    setReplyingTo,
  } = useChatStore();

  const convoId = activeConversationId ?? null;

  const messages = useMemo(
    () => (convoId ? allMessages[convoId]?.items ?? [] : []),
    [allMessages, convoId]
  );

  const messageData = convoId ? allMessages[convoId] : null;
  const hasMore = messageData?.hasMore ?? false;

  const selectedConvo = conversations.find((c) => c._id === convoId);

  const bottomRef = useRef<HTMLDivElement>(null);
  const { user } = useAuthStore();
  const { typingUsers } = useSocketStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number>(0);
  const prevMessageCount = useRef(0);
  const isFirstLoad = useRef(true);
  const lastItemId = messages[messages.length - 1]?._id;

  const activeTypingUserIds = convoId
    ? (typingUsers[convoId]?.filter(id => id !== user?._id) || [])
    : [];

  const activeTypingParticipants = activeTypingUserIds.map(id =>
    selectedConvo?.participants.find(p => p.userId?._id?.toString() === id)
  );

  const loadingOlderRef = useRef(false);

  useEffect(() => {
    const scrollToBottom = (instant = false) => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: instant ? "auto" : "smooth"
        });
      }
    };
    // if we're currently loading older messages, skip auto-scrolling to bottom
    if (loadingOlderRef.current) return;

    if (isFirstLoad.current) {
      if (messages.length > 0) {
        requestAnimationFrame(() => {
          scrollToBottom(true);
          setTimeout(() => scrollToBottom(true), 100);
        });
        isFirstLoad.current = false;
      }
    } else if (convoId) {
      const isStatusUpdate = messages.length === prevMessageCount.current;
      scrollToBottom(isStatusUpdate);
    }
  }, [lastItemId, activeTypingUserIds.length, messages.length, convoId]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 500;
        if (isNearBottom && !isFirstLoad.current) {
            container.scrollTop = container.scrollHeight;
        }
    });

    const content = container.firstElementChild;
    if (content) resizeObserver.observe(content);

    return () => resizeObserver.disconnect();
  }, [convoId]);

  useEffect(() => {
    isFirstLoad.current = true;
    prevMessageCount.current = 0;
    loadingOlderRef.current = false;
    prevScrollHeightRef.current = 0;
  }, [convoId]);

  useEffect(() => {
    prevMessageCount.current = messages.length;
  }, [messages.length]);

  const handleScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container || !convoId) return;
    if (loadingOlderRef.current) return;

    const canFetchMoreMessages = hasMore && !messageLoading;

    if (container.scrollTop < 100 && canFetchMoreMessages) {
      prevScrollHeightRef.current = container.scrollHeight;
      loadingOlderRef.current = true;

      fetchMessages(convoId);
    }
  }, [convoId, hasMore, messageLoading, fetchMessages]);

  useEffect(() => {
    if (!convoId || !loadingOlderRef.current) return;
    if (messageLoading) return;

    const container = scrollRef.current;
    if (!container) {
      loadingOlderRef.current = false;
      return;
    }

    const previousHeight = prevScrollHeightRef.current;
    const newHeight = container.scrollHeight;
    const delta = Math.max(0, newHeight - previousHeight);

    if (delta > 0) {
      container.scrollTop += delta;
    }

    loadingOlderRef.current = false;

    const stillCanFetch = hasMore && !messageLoading;
    if (stillCanFetch && container.scrollTop < 24) {
      requestAnimationFrame(() => handleScroll());
    }
  }, [messages.length, messageLoading, convoId, hasMore, handleScroll]);

  if (!convoId || !selectedConvo) {
    return <ChatWelcomeScreen />;
  }

  if (messages.length === 0 && activeTypingUserIds.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Chưa có tin nhắn nào trong cuộc trò chuyện này!
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-primary-foreground overflow-hidden">
      <PinnedMessagesBanner />

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden beautiful-scrollbar px-2 md:px-4 pb-2"
      >
        {messageLoading && hasMore && (
          <div className="flex justify-center py-4 text-sm text-muted-foreground">
            Đang tải tin nhắn cũ...
          </div>
        )}

        {messages.map((message, index) => {
          const isCallMessage = message.type === "system" && message.systemType === "call";

          if (isCallMessage) {
            return (
              <CallMessageItem
                key={`call-${message._id}`}
                message={message}
                currentUserId={user?._id ?? ""}
                selectedConvo={selectedConvo}
                isLast={message._id === lastItemId}
              />
            );
          }

          return (
            <div
              key={`msg-${message._id ?? index}`}
              id={`msg-${message._id}`}
            >
              <MessageItem
                message={message}
                index={index}
                messages={messages}
                selectedConvo={selectedConvo}
                currentUserId={user?._id ?? ""}
                isLast={message._id === lastItemId}
                onReply={setReplyingTo}
              />
            </div>
          );
        })}

        {activeTypingParticipants.length > 0 && (
          <div className="flex gap-2 mx-2 px-1 mt-0.5 justify-start">
            <div className="w-8 shrink-0 pt-0.5" />
            <div className="px-3.5 py-2.5 text-sm bg-gray-100 dark:bg-gray-800 text-foreground rounded-2xl rounded-bl-none shadow-sm border-0 flex items-center gap-1">
              <span className="flex gap-1 items-center h-5">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span>
              </span>
              <span className="ml-2 text-xs italic text-muted-foreground max-w-[56vw] truncate sm:max-w-none sm:truncate-none">
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