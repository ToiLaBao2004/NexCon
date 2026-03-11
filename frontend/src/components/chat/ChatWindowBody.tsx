import { useChatStore } from "@/stores/useChatStore";
import ChatWelcomeScreen from "./ChatWelcomeScreen";
import MessageItem from "./MessageItem";
import CallMessageItem from "./CallMessageItem";
import { PinnedMessagesBanner } from "@/components/chat/PinnedMessagesBanner";
import { useEffect, useMemo, useRef } from "react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useSocketStore } from "@/stores/useSocketStore";
import { useCallHistoryStore } from "@/stores/useCallHistoryStore";
import type { Message } from "@/types/chat";
import type { CallRecord } from "@/types/call";

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

  const { callsByConversation, fetchCallsByConversation } = useCallHistoryStore();
  const calls = useMemo(
    () => (convoId ? callsByConversation[convoId]?.items ?? [] : []),
    [callsByConversation, convoId]
  );

  const timeline: TimelineItem[] = useMemo(() => {
    const messageItems: TimelineItem[] = messages.map(msg => ({ kind: "message", data: msg }));
    const callItems: TimelineItem[] = calls.map(call => ({ kind: "call", data: call }));
    return [...messageItems, ...callItems].sort(
      (a, b) => new Date(a.data.createdAt).getTime() - new Date(b.data.createdAt).getTime()
    );
  }, [messages, calls]);

  const lastItemId = timeline[timeline.length - 1]?.data._id;
  const firstItemId = timeline[0]?.data._id;

  const activeTypingUserIds = convoId
    ? (typingUsers[convoId]?.filter(id => id !== user?._id) || [])
    : [];

  const activeTypingParticipants = activeTypingUserIds.map(id =>
    selectedConvo?.participants.find(p => p.userId?._id?.toString() === id)
  );

  const prevFirstItemId = useRef<string | undefined>(undefined);

  useEffect(() => {
    const scrollToBottom = (instant = false) => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: instant ? "auto" : "smooth"
        });
      }
    };

    if (isFirstLoad.current) {
      if (timeline.length > 0) {
        requestAnimationFrame(() => {
          scrollToBottom(true);
          setTimeout(() => scrollToBottom(true), 100);
        });
        isFirstLoad.current = false;
      }
    } else if (convoId) {
      const isStatusUpdate = timeline.length === prevMessageCount.current;
      scrollToBottom(isStatusUpdate);
    }
  }, [lastItemId, activeTypingUserIds.length, timeline.length, convoId]);

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
    prevFirstItemId.current = undefined;
    prevMessageCount.current = 0;
  }, [convoId]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !convoId) return;

    const loadedOlderMessages =
      timeline.length > prevMessageCount.current &&
      prevMessageCount.current > 0 &&
      firstItemId !== prevFirstItemId.current;

    if (loadedOlderMessages) {
      const newScrollHeight = container.scrollHeight;
      container.scrollTop = newScrollHeight - prevScrollHeightRef.current;
    }

    prevMessageCount.current = timeline.length;
    prevFirstItemId.current = firstItemId;
  }, [timeline.length, firstItemId, convoId]);

  const { loading: callHistoryLoading } = useCallHistoryStore();
  const callData = convoId ? callsByConversation[convoId] : null;
  const hasMoreCalls = callData?.hasMore ?? false;

  const handleScroll = () => {
    const container = scrollRef.current;
    if (!container || !convoId) return;

    const canFetchMoreMessages = hasMore && !messageLoading;
    const canFetchMoreCalls = hasMoreCalls && !callHistoryLoading;

    if (container.scrollTop < 100 && (canFetchMoreMessages || canFetchMoreCalls)) {
      prevScrollHeightRef.current = container.scrollHeight;

      if (canFetchMoreMessages) {
        fetchMessages();
      }

      if (canFetchMoreCalls) {
        fetchCallsByConversation(convoId);
      }
    }
  };

  if (!convoId || !selectedConvo) {
    return <ChatWelcomeScreen />;
  }

  if (timeline.length === 0 && activeTypingUserIds.length === 0) {
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

        {timeline.map((item, index) => {
          if (item.kind === "message") {
            const msgIdx = messages.indexOf(item.data);
            return (
              <div
                key={`msg-${item.data._id ?? index}`}
                id={`msg-${item.data._id}`}
              >
                <MessageItem
                  message={item.data}
                  index={msgIdx >= 0 ? msgIdx : index}
                  messages={messages}
                  selectedConvo={selectedConvo}
                  currentUserId={user?._id ?? ""}
                  isLast={item.data._id === lastItemId}
                />
              </div>
            );
          }

          return (
            <CallMessageItem
              key={`call-${item.data._id}`}
              call={item.data as CallRecord}
              currentUserId={user?._id ?? ""}
              selectedConvo={selectedConvo}
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