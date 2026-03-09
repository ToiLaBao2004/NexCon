import { useChatStore } from "@/stores/useChatStore";
import ChatWelcomeScreen from "./ChatWelcomeScreen";
import MessageItem from "./MessageItem";
import CallMessageItem from "./CallMessageItem";
import { useEffect, useMemo, useRef } from "react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useSocketStore } from "@/stores/useSocketStore";
import { useCallHistoryStore } from "@/stores/useCallHistoryStore";
import type { Message } from "@/types/chat";
import type { CallRecord } from "@/types/call";

// Unified timeline item: either a message or a call record
type TimelineItem =
  | { kind: "message"; data: Message }
  | { kind: "call"; data: CallRecord };

const ChatWindowBody = () => {
  const {
    activeConversationId,
    conversations,
    messages: allMessages,
    fetchMessages,
    messageLoading,
  } = useChatStore();
  const messages = useMemo(
    () => allMessages[activeConversationId!]?.items ?? [],
    [allMessages, activeConversationId]
  );
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

  // Call history
  const { callsByConversation, fetchCallsByConversation } = useCallHistoryStore();
  const calls = useMemo(
    () => callsByConversation[activeConversationId!]?.items ?? [],
    [callsByConversation, activeConversationId]
  );

  // Fetch call history when conversation changes
  useEffect(() => {
    if (activeConversationId) {
      fetchCallsByConversation(activeConversationId);
    }
  }, [activeConversationId, fetchCallsByConversation]);

  // Build merged timeline sorted by createdAt
  const timeline: TimelineItem[] = useMemo(() => {
    const messageItems: TimelineItem[] = messages.map(msg => ({ kind: "message", data: msg }));
    const callItems: TimelineItem[] = calls.map(call => ({ kind: "call", data: call }));

    return [...messageItems, ...callItems].sort(
      (a, b) =>
        new Date(a.data.createdAt).getTime() - new Date(b.data.createdAt).getTime()
    );
  }, [messages, calls]);

  const lastItemId = timeline[timeline.length - 1]?.data._id;
  const firstItemId = timeline[0]?.data._id;
  const activeTypingUserIds = typingUsers[activeConversationId!]?.filter(id => id !== user?._id) || [];
  const activeTypingParticipants = activeTypingUserIds.map(id => selectedConvo?.participants.find(p => p.userId?._id?.toString() === id));

  const prevFirstItemId = useRef<string | undefined>(undefined);

  useEffect(() => {
    const scrollToBottom = () => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    };

    if (isFirstLoad.current) {
      if (timeline.length > 0) {
        requestAnimationFrame(() => {
          scrollToBottom();
          setTimeout(scrollToBottom, 50);
        });
        isFirstLoad.current = false;
      }
    } else {
      scrollToBottom();
    }
  }, [lastItemId, activeTypingUserIds.length, timeline.length]);

  useEffect(() => {
    isFirstLoad.current = true;
    prevFirstItemId.current = undefined;
    prevMessageCount.current = 0;
  }, [activeConversationId]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const loadedOlderMessages =
      timeline.length > prevMessageCount.current &&
      prevMessageCount.current > 0 &&
      firstItemId !== prevFirstItemId.current;

    if (loadedOlderMessages) {
      const newScrollHeight = container.scrollHeight;
      // Giữ nguyên vị trí cuộn khi tin nhắn cũ được nhúng lên đầu
      container.scrollTop = newScrollHeight - prevScrollHeightRef.current;
    }

    prevMessageCount.current = timeline.length;
    prevFirstItemId.current = firstItemId;
  }, [timeline.length, firstItemId]);

  const { loading: callHistoryLoading } = useCallHistoryStore();
  const callData = callsByConversation[activeConversationId!];
  const hasMoreCalls = callData?.hasMore ?? false;

  const handleScroll = () => {
    const container = scrollRef.current;
    if (!container) return;

    // Unified infinite scroll: load more if either messages or calls have more items
    const canFetchMoreMessages = hasMore && !messageLoading;
    const canFetchMoreCalls = hasMoreCalls && !callHistoryLoading;

    if (container.scrollTop < 100 && (canFetchMoreMessages || canFetchMoreCalls)) {
      prevScrollHeightRef.current = container.scrollHeight;

      if (canFetchMoreMessages) {
        fetchMessages();
      }

      if (canFetchMoreCalls) {
        fetchCallsByConversation(activeConversationId!);
      }
    }
  };

  if (!selectedConvo) {
    return <ChatWelcomeScreen />;
  }

  if (!timeline.length && activeTypingUserIds.length === 0) {
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
        className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden beautiful-scrollbar"
      >
        {messageLoading && hasMore && (
          <div className="flex justify-center py-2 text-sm text-muted-foreground">
            Đang tải...
          </div>
        )}
        {timeline.map((item, index) => {
          if (item.kind === "message") {
            // Find message index within the original messages array for group-break logic
            const msgIdx = messages.indexOf(item.data);
            return (
              <MessageItem
                key={`msg-${item.data._id ?? index}`}
                message={item.data}
                index={msgIdx >= 0 ? msgIdx : index}
                messages={messages}
                selectedConvo={selectedConvo}
                currentUserId={user?._id ?? ""}
              />
            );
          }
          return (
            <CallMessageItem
              key={`call-${item.data._id}`}
              call={item.data as CallRecord}
              currentUserId={user?._id ?? ""}
              selectedConvo={selectedConvo!}
              isLast={item.data._id === lastItemId}
            />
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
