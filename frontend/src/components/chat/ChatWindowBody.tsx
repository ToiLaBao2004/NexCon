import React from "react";
import { useChatStore } from "@/stores/useChatStore";
import { ChevronsDown } from "lucide-react";
import ChatWelcomeScreen from "./ChatWelcomeScreen";
import MessageItem from "./MessageItem";
import CallMessageItem from "./CallMessageItem";
import { PinnedMessagesBanner } from "@/components/chat/PinnedMessagesBanner";
import { useEffect, useMemo, useRef, useState } from "react";

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
    jumpContexts,
    loadOlderInJumpMode,
    loadNewerInJumpMode,
    exitJumpMode,
  } = useChatStore();

  const convoId = activeConversationId ?? null;
  const jumpContext = useMemo(() => convoId ? jumpContexts[convoId] : null, [jumpContexts, convoId]);
  const isJumpMode = jumpContext?.isJumpMode ?? false;

  const messages = useMemo(
    () => (convoId ? allMessages[convoId]?.items ?? [] : []),
    [allMessages, convoId]
  );

  const messageData = convoId ? allMessages[convoId] : null;
  const hasMoreOlder = isJumpMode ? (jumpContext?.hasMoreOlder ?? false) : (messageData?.hasMore ?? false);
  const hasMoreNewer = isJumpMode ? (jumpContext?.hasMoreNewer ?? false) : false;

  const selectedConvo = conversations.find((c) => c._id === convoId);

  const bottomRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);

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

  const activeTypingParticipants = activeTypingUserIds.map((id: string) =>
    selectedConvo?.participants.find(p => p.userId?._id?.toString() === id)
  );

  const lastMyMessageId = useMemo(() => {
    if (!user?._id || messages.length === 0) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.type === "system" && m.systemType !== "call") continue;
      const mSenderObj = typeof m.senderId === "object" ? (m.senderId as any) : null;
      const mSenderId = mSenderObj ? mSenderObj._id : m.senderId;
      if (mSenderId?.toString() === user._id.toString()) {
        return m._id;
      }
    }
    return null;
  }, [messages, user?._id]);

  const loadingMoreRef = useRef(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  // Track scroll position to show "Back to latest" button in normal mode
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      // Show button if we are more than 800px away from bottom
      const isFarFromBottom = scrollHeight - scrollTop - clientHeight > 800;
      setShowScrollToBottom(isFarFromBottom);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Check initial state

    return () => container.removeEventListener('scroll', handleScroll);
  }, [convoId]);


  // IntersectionObserver for top sentinel (load older)
  useEffect(() => {
    if (!topSentinelRef.current || !convoId) return;
    if (!hasMoreOlder || messageLoading) return;

    const observer = new IntersectionObserver((entries: any) => {
      const [entry] = entries;
      if (entry.isIntersecting && !loadingMoreRef.current) {
        loadingMoreRef.current = true;
        prevScrollHeightRef.current = scrollRef.current?.scrollHeight ?? 0;

        if (isJumpMode) {
          loadOlderInJumpMode(convoId);
        } else {
          fetchMessages(convoId);
        }
      }
    }, { threshold: 0.1 });

    observer.observe(topSentinelRef.current);
    return () => observer.disconnect();
  }, [convoId, hasMoreOlder, messageLoading, isJumpMode, fetchMessages, loadOlderInJumpMode]);

  // IntersectionObserver for bottom sentinel (load newer)
  useEffect(() => {
    if (!bottomSentinelRef.current || !convoId) return;
    if (!isJumpMode || !hasMoreNewer || messageLoading) return;

    const observer = new IntersectionObserver((entries: any) => {
      const [entry] = entries;
      if (entry.isIntersecting && !loadingMoreRef.current) {
        loadingMoreRef.current = true;
        loadNewerInJumpMode(convoId);
      }
    }, { threshold: 0.1 });

    observer.observe(bottomSentinelRef.current);
    return () => observer.disconnect();
  }, [convoId, isJumpMode, hasMoreNewer, messageLoading, loadNewerInJumpMode]);

  // Restore scroll position after loading older messages
  useEffect(() => {
    if (!convoId || !loadingMoreRef.current) return;
    if (messageLoading) return;

    const container = scrollRef.current;
    if (container && prevScrollHeightRef.current > 0) {
      const newHeight = container.scrollHeight;
      const delta = newHeight - prevScrollHeightRef.current;
      if (delta > 0) {
        container.scrollTop += delta;
      }
      prevScrollHeightRef.current = 0;
    }

    // Delay resetting loading flag to ensure ResizeObserver sees it as true during layout
    requestAnimationFrame(() => {
      loadingMoreRef.current = false;
    });
  }, [messages.length, messageLoading, convoId]);


  const prevLastItemIdRef = useRef<string | undefined>(undefined);

  // Handle auto-scroll to bottom on first load or new messages
  useEffect(() => {
    const scrollToBottom = (instant: boolean = false) => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: instant ? "auto" : "smooth"
        });
      }
    };

    const isNewMessageAtBottom = lastItemId !== prevLastItemIdRef.current;
    prevLastItemIdRef.current = lastItemId;

    if (loadingMoreRef.current || isJumpMode || showScrollToBottom) return;

    if (isFirstLoad.current) {
      if (messages.length > 0) {
        requestAnimationFrame(() => {
          scrollToBottom(true);
          setTimeout(() => scrollToBottom(true), 100);
        });
        isFirstLoad.current = false;
      }
    } else if (convoId && isNewMessageAtBottom) {
      scrollToBottom();
    }
  }, [lastItemId, messages.length, convoId, isJumpMode]);


  // Handle jump scroll to anchor
  const anchorId = jumpContext?.anchorId;
  useEffect(() => {
    if (!anchorId || !isJumpMode) return;

    requestAnimationFrame(() => {
      const el = document.getElementById(`message-${anchorId}`);
      if (!el) return;

      el.scrollIntoView({ behavior: 'instant', block: 'center' });
      el.classList.add('animate-jump-highlight');
      setTimeout(() => el.classList.remove('animate-jump-highlight'), 3000);
    });
  }, [anchorId, isJumpMode]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      // Don't auto-scroll to bottom if we are loading older/newer messages
      if (loadingMoreRef.current) return;

      const { scrollTop, scrollHeight, clientHeight } = container;
      // Only auto-scroll if near bottom and NOT near the top
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 150;
      const isNearTop = scrollTop < 100;

      if (isNearBottom && !isNearTop && !isFirstLoad.current && !isJumpMode) {
        container.scrollTop = scrollHeight;
      }
    });

    const content = container.firstElementChild;
    if (content) resizeObserver.observe(content);

    return () => resizeObserver.disconnect();
  }, [convoId, isJumpMode]);


  useEffect(() => {
    isFirstLoad.current = true;
    prevLastItemIdRef.current = undefined;
    prevMessageCount.current = 0;
    loadingMoreRef.current = false;
    prevScrollHeightRef.current = 0;
  }, [convoId]);


  useEffect(() => {
    prevMessageCount.current = messages.length;
  }, [messages.length]);

  if (!convoId || !selectedConvo) {
    return <ChatWelcomeScreen />;
  }

  if (messages.length === 0 && activeTypingUserIds.length === 0 && !messageLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Chưa có tin nhắn nào trong cuộc trò chuyện này!
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-primary-foreground overflow-hidden relative">
      <PinnedMessagesBanner />

      <div
        ref={scrollRef}
        className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden beautiful-scrollbar px-2 md:px-4 pb-2"
      >
        <div ref={topSentinelRef} className="h-1 shrink-0" />

        {messageLoading && (
          <div className="flex justify-center py-4 text-sm text-muted-foreground">
            {isJumpMode ? "Đang tải dữ liệu quanh tin nhắn..." : "Đang tải tin nhắn..."}
          </div>
        )}

        {messages.map((message, index) => {
          const isCallMessage = message.type === "system" && message.systemType === "call";
          const isLastMyMsg = message._id === lastMyMessageId;

          if (isCallMessage) {
            return (
              <CallMessageItem
                key={`call-${message._id}`}
                message={message}
                currentUserId={user?._id ?? ""}
                selectedConvo={selectedConvo}
                isLast={message._id === lastItemId}
                isLastMyMessage={isLastMyMsg}
              />
            );
          }

          return (
            <div
              key={`msg-${message._id ?? index}`}
              id={`message-${message._id}`}
            >
              <MessageItem
                message={message}
                index={index}
                messages={messages}
                selectedConvo={selectedConvo}
                currentUserId={user?._id ?? ""}
                isLastMyMessage={isLastMyMsg}
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

        <div ref={bottomSentinelRef} className="h-1 shrink-0" />
        <div ref={bottomRef} />
      </div>

      {(isJumpMode || showScrollToBottom) && (
        <button
          onClick={async () => {
            if (isJumpMode) {
              await exitJumpMode(convoId);
              setTimeout(() => {
                scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'auto' });
              }, 150);
            } else {
              scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
            }
          }}
          className="absolute bottom-6 right-6 z-20 flex h-11 w-11 items-center justify-center 
                     rounded-full bg-white dark:bg-slate-800 shadow-xl border border-slate-200 dark:border-slate-700
                     hover:bg-slate-50 dark:hover:bg-slate-700 transition-all active:scale-90
                     animate-in fade-in slide-in-from-bottom-4 zoom-in-50 duration-300 group"
        >
          <ChevronsDown className="h-9 w-9 text-slate-600 dark:text-slate-300 group-hover:translate-y-0.5 transition-transform stroke-[1.5px]" />
        </button>
      )}



    </div>
  );
};


export default ChatWindowBody;