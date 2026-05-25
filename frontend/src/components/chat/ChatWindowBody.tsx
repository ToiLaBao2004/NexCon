import React from "react";
import { useChatStore } from "@/stores/useChatStore";
import { ChevronsDown } from "lucide-react";
import ChatWelcomeScreen from "./ChatWelcomeScreen";
import MessageItem from "./MessageItem";
import CallMessageItem from "./CallMessageItem";
import { PinnedMessagesBanner } from "@/components/chat/PinnedMessagesBanner";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useAuthStore } from "@/stores/useAuthStore";
import { useSocketStore } from "@/stores/useSocketStore";
import type { Message } from "@/types/chat";

const getImageBatchId = (message: Message) => {
  if (message.type !== "image") return "";
  const metadata = message.metadata instanceof Map
    ? Object.fromEntries(message.metadata)
    : (message.metadata || {});
  const batchId = String(metadata.clientBatchId || "").trim();
  const batchSize = Number(metadata.clientBatchSize || 0);
  return batchId && batchSize > 1 ? batchId : "";
};

const getImageBatchIndex = (message: Message) => {
  const metadata = message.metadata instanceof Map
    ? Object.fromEntries(message.metadata)
    : (message.metadata || {});
  return Number(metadata.clientBatchIndex ?? 0);
};

const SCROLL_TO_BOTTOM_BUTTON_THRESHOLD = 800;
const NEAR_BOTTOM_THRESHOLD = 96;
const STICKY_BOTTOM_THRESHOLD = 160;

const getMessageSenderId = (message?: Message | null) => {
  if (!message?.senderId) return "";
  const senderObj = typeof message.senderId === "object" ? (message.senderId as any) : null;
  return String(senderObj?._id || message.senderId || "");
};

const getMessageStableKey = (message?: Message | null) => {
  if (!message) return "";
  return String(message.clientTempId || message._id || "");
};

function TypingIndicatorPill({ name }: { name: string }) {
  return (
    <div className="flex min-w-0 max-w-[80%] items-center gap-2.5 rounded-full border border-border/40 bg-white/80 px-3.5 py-1.5 shadow-lg shadow-black/5 backdrop-blur-md dark:bg-slate-900/80 sm:max-w-[360px]">
      <span className="flex h-5 shrink-0 items-center gap-1">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:-0.3s]"></span>
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:-0.15s]"></span>
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60"></span>
      </span>
      <span className="min-w-0 truncate pr-1 text-[12px] font-medium text-foreground/80">
        <span className="font-bold text-foreground">{name}</span>
        {" "}đang soạn tin nhắn...
      </span>
    </div>
  );
}

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
  const contentRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number>(0);
  const prevMessageCount = useRef(0);
  const isFirstLoad = useRef(true);
  const lastItemId = messages[messages.length - 1]?._id;
  const lastItemKey = getMessageStableKey(messages[messages.length - 1]);

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

  const renderedMessages = useMemo(() => {
    const groups = new Map<string, Message[]>();

    for (const message of messages) {
      const batchId = getImageBatchId(message);
      if (!batchId) continue;
      const items = groups.get(batchId) ?? [];
      items.push(message);
      groups.set(batchId, items);
    }

    for (const items of groups.values()) {
      items.sort((a, b) => {
        const aIndex = getImageBatchIndex(a);
        const bIndex = getImageBatchIndex(b);
        if (aIndex !== bIndex) return aIndex - bIndex;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
    }

    const firstByBatchId = new Map<string, string>();
    for (const [batchId, items] of groups) {
      if (items[0]?._id) {
        firstByBatchId.set(batchId, items[0]._id);
      }
    }

    return messages
      .map((message, originalIndex) => {
        const batchId = getImageBatchId(message);
        return {
          message,
          renderKey: getMessageStableKey(message),
          originalIndex,
          imageBatchItems: batchId ? (groups.get(batchId) ?? [message]) : undefined,
          isHiddenBatchChild: batchId ? firstByBatchId.get(batchId) !== message._id : false,
        };
      })
      .filter((item) => !item.isHiddenBatchChild);
  }, [messages]);

  const loadingMoreRef = useRef(false);
  const suppressAutoScrollUntilRef = useRef(0);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [pendingNewMessageIds, setPendingNewMessageIds] = useState<string[]>([]);
  const distanceFromBottomRef = useRef(0);
  const followBottomUntilRef = useRef(0);
  const followBottomTimersRef = useRef<ReturnType<typeof window.setTimeout>[]>([]);
  const scrollToBottom = useCallback((instant: boolean = false, force: boolean = false) => {
    if (!force && Date.now() < suppressAutoScrollUntilRef.current) return;
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: instant ? "auto" : "smooth",
      });
    }
  }, []);

  const scheduleFollowBottom = useCallback((durationMs: number = 500) => {
    followBottomUntilRef.current = Math.max(followBottomUntilRef.current, Date.now() + durationMs);

    const run = () => scrollToBottom(true, true);
    requestAnimationFrame(run);

    for (const delay of [60, 140, 260, 420]) {
      const timer = window.setTimeout(() => {
        run();
        followBottomTimersRef.current = followBottomTimersRef.current.filter((item) => item !== timer);
      }, delay);
      followBottomTimersRef.current.push(timer);
    }
  }, [scrollToBottom]);

  const syncScrollState = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = Math.max(0, scrollHeight - scrollTop - clientHeight);
    distanceFromBottomRef.current = distanceFromBottom;
    setIsNearBottom(distanceFromBottom <= NEAR_BOTTOM_THRESHOLD);
    setShowScrollToBottom(distanceFromBottom > SCROLL_TO_BOTTOM_BUTTON_THRESHOLD);

    setPendingNewMessageIds((current) => {
      if (current.length === 0) return current;
      if (distanceFromBottom <= NEAR_BOTTOM_THRESHOLD) return [];

      const containerRect = container.getBoundingClientRect();
      const reachedLine = containerRect.bottom - 48;
      const reachedIds = new Set<string>();

      container.querySelectorAll<HTMLElement>("[data-message-ids]").forEach((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.top >= reachedLine) return;

        const messageIds = element.dataset.messageIds?.split(" ").filter(Boolean) ?? [];
        messageIds.forEach((id) => reachedIds.add(id));
      });

      const next = current.filter((id) => !reachedIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, []);

  // Track scroll position to show "Back to latest" button in normal mode
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    container.addEventListener('scroll', syncScrollState, { passive: true });
    syncScrollState(); // Check initial state

    return () => container.removeEventListener('scroll', syncScrollState);
  }, [convoId, syncScrollState]);

  useEffect(() => {
    const handleInputFocus = (event: Event) => {
      const detail = (event as CustomEvent<{ conversationId?: string }>).detail;
      if (detail?.conversationId && detail.conversationId !== convoId) return;

      suppressAutoScrollUntilRef.current = Date.now() + 350;
      const container = scrollRef.current;
      if (!container) return;

      const scrollTop = container.scrollTop;
      requestAnimationFrame(() => {
        if (Date.now() < suppressAutoScrollUntilRef.current) {
          container.scrollTop = scrollTop;
        }
      });
    };

    window.addEventListener("nexcon:message-input-focus", handleInputFocus as EventListener);
    return () => window.removeEventListener("nexcon:message-input-focus", handleInputFocus as EventListener);
  }, [convoId]);

  useEffect(() => {
    const handleMessageSend = (event: Event) => {
      const detail = (event as CustomEvent<{ conversationId?: string }>).detail;
      if (detail?.conversationId && detail.conversationId !== convoId) return;

      suppressAutoScrollUntilRef.current = 0;
      scheduleFollowBottom(700);
    };

    window.addEventListener("nexcon:message-send", handleMessageSend as EventListener);
    return () => window.removeEventListener("nexcon:message-send", handleMessageSend as EventListener);
  }, [convoId, scheduleFollowBottom]);


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


  const prevLastItemKeyRef = useRef<string | undefined>(undefined);
  const lastImageScrollIdRef = useRef<string | undefined>(undefined);
  const pendingImageScrollRef = useRef(false);

  // Handle auto-scroll to bottom on first load or new messages
  useEffect(() => {
    const isNewMessageAtBottom = lastItemKey !== prevLastItemKeyRef.current;
    prevLastItemKeyRef.current = lastItemKey;

    const lastMessage = messages[messages.length - 1];
    const lastSenderId = getMessageSenderId(lastMessage);
    const isSystemNonCall = lastMessage?.type === "system" && lastMessage?.systemType !== "call";
    const isOwnLastMessage = Boolean(
      !isSystemNonCall &&
      lastSenderId &&
      user?._id &&
      lastSenderId?.toString?.() === user._id.toString()
    );
    const isIncomingLastMessage = Boolean(
      !isSystemNonCall &&
      lastMessage?._id &&
      lastSenderId &&
      user?._id &&
      lastSenderId !== user._id.toString()
    );
    const shouldFollowImage = lastMessage?.type === "image";

    if (loadingMoreRef.current) return;

    if (isJumpMode && convoId && isNewMessageAtBottom && isOwnLastMessage) {
      pendingImageScrollRef.current = shouldFollowImage;
      void exitJumpMode(convoId).then(() => {
        requestAnimationFrame(() => scrollToBottom(true, true));
        setTimeout(() => scrollToBottom(true, true), 120);
      });
      return;
    }

    if (isJumpMode) return;

    if (isFirstLoad.current) {
      if (messages.length > 0) {
        pendingImageScrollRef.current = shouldFollowImage;
        requestAnimationFrame(() => {
          scrollToBottom(true);
          setTimeout(() => scrollToBottom(true), 100);
        });
        isFirstLoad.current = false;
      }
    } else if (convoId && isNewMessageAtBottom) {
      const wasNearBottom = distanceFromBottomRef.current <= NEAR_BOTTOM_THRESHOLD;

      if (isIncomingLastMessage && !wasNearBottom && lastMessage?._id) {
        setPendingNewMessageIds((current) =>
          current.includes(lastMessage._id) ? current : [...current, lastMessage._id]
        );
        setShowScrollToBottom(true);
        return;
      }

      if (isOwnLastMessage) {
        pendingImageScrollRef.current = shouldFollowImage;
        scheduleFollowBottom(700);
        return;
      }

      if (wasNearBottom) {
        pendingImageScrollRef.current = shouldFollowImage;
        scheduleFollowBottom(500);
      }
    }
  }, [lastItemKey, messages.length, convoId, isJumpMode, user?._id, exitJumpMode, scrollToBottom, scheduleFollowBottom, messages]);

  useEffect(() => {
    requestAnimationFrame(syncScrollState);
  }, [lastItemKey, syncScrollState]);

  useLayoutEffect(() => {
    if (!convoId || isJumpMode || activeTypingUserIds.length === 0) return;
    if (distanceFromBottomRef.current > STICKY_BOTTOM_THRESHOLD) return;
    scheduleFollowBottom(450);
  }, [activeTypingUserIds.length, convoId, isJumpMode, scheduleFollowBottom]);

  useEffect(() => {
    if (!convoId || messages.length === 0) return;

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.type !== "image") return;

    if (!pendingImageScrollRef.current) return;

    if (lastMessage._id === lastImageScrollIdRef.current) {
      pendingImageScrollRef.current = false;
      return;
    }

    const lastSenderObj = typeof lastMessage.senderId === "object" ? (lastMessage.senderId as any) : null;
    const lastSenderId = lastSenderObj ? lastSenderObj._id : lastMessage.senderId;
    const isOwnLastMessage = Boolean(
      lastSenderId && user?._id && lastSenderId?.toString?.() === user._id.toString()
    );
    if (!isOwnLastMessage) return;

    const container = document.getElementById(`message-${lastMessage._id}`);
    if (!container) return;

    const images = Array.from(container.querySelectorAll("img"));
    if (images.length === 0) {
      pendingImageScrollRef.current = false;
      return;
    }

    let hasScrolled = false;
    const handleLoad = () => {
      if (hasScrolled) return;
      hasScrolled = true;
      pendingImageScrollRef.current = false;
      lastImageScrollIdRef.current = lastMessage._id;
      scrollToBottom(true, true);
      setTimeout(() => scrollToBottom(true, true), 120);
    };

    const pending: HTMLImageElement[] = [];
    images.forEach((img) => {
      if (img.complete && img.naturalHeight > 0) {
        handleLoad();
      } else {
        pending.push(img);
        img.addEventListener("load", handleLoad, { once: true });
      }
    });

    return () => {
      pending.forEach((img) => img.removeEventListener("load", handleLoad));
    };
  }, [convoId, lastItemKey, messages, scrollToBottom, user?._id]);


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

    // Biến lưu trữ chiều cao trước khi resize để tính toán delta
    let lastHeight = container.getBoundingClientRect().height;

    const handleResize = () => {
      if (loadingMoreRef.current || isJumpMode) return;
      if (Date.now() < suppressAutoScrollUntilRef.current) return;

      const { scrollTop, scrollHeight } = container;
      const clientHeight = container.getBoundingClientRect().height;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      const heightDelta = lastHeight - clientHeight;
      lastHeight = clientHeight;

      if (heightDelta !== 0) {
        if (isAtBottom && bottomRef.current) {
          bottomRef.current.scrollIntoView({ behavior: 'instant', block: 'end' });
        } else {
          container.scrollTop = scrollTop + heightDelta;
        }
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    window.addEventListener('resize', handleResize);

    const handleViewportChange = () => {
      if (!window.visualViewport || isJumpMode || loadingMoreRef.current) return;
      handleResize();
    };

    window.visualViewport?.addEventListener('resize', handleViewportChange);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
    };
  }, [convoId, isJumpMode]);


  useEffect(() => {
    const container = scrollRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    let lastScrollHeight = container.scrollHeight;
    let frameId = 0;

    const handleContentResize = () => {
      const previousScrollHeight = lastScrollHeight;
      const previousDistanceFromBottom = Math.max(
        0,
        previousScrollHeight - container.scrollTop - container.clientHeight
      );
      const nextScrollHeight = container.scrollHeight;
      const heightDelta = nextScrollHeight - previousScrollHeight;
      lastScrollHeight = nextScrollHeight;
      const shouldFollowBottom = Date.now() < followBottomUntilRef.current;

      if (Math.abs(heightDelta) < 1) return;
      if (loadingMoreRef.current || isJumpMode) return;
      if (!shouldFollowBottom && Date.now() < suppressAutoScrollUntilRef.current) return;
      if (!shouldFollowBottom && previousDistanceFromBottom > STICKY_BOTTOM_THRESHOLD) return;

      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        scrollToBottom(true, true);
        syncScrollState();
      });
    };

    const resizeObserver = new ResizeObserver(handleContentResize);
    resizeObserver.observe(content);

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
    };
  }, [convoId, isJumpMode, scrollToBottom, syncScrollState]);


  useEffect(() => {
    isFirstLoad.current = true;
    prevLastItemKeyRef.current = undefined;
    prevMessageCount.current = 0;
    loadingMoreRef.current = false;
    prevScrollHeightRef.current = 0;
    distanceFromBottomRef.current = 0;
    followBottomUntilRef.current = 0;
    followBottomTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    followBottomTimersRef.current = [];
    setIsNearBottom(true);
    setPendingNewMessageIds([]);
  }, [convoId]);

  useEffect(() => {
    return () => {
      followBottomTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      followBottomTimersRef.current = [];
    };
  }, []);


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

  const typingDisplayName = activeTypingParticipants.length === 1
    ? activeTypingParticipants[0]?.userId?.nickname || activeTypingParticipants[0]?.userId?.displayName || "Ai đó"
    : `${activeTypingParticipants.length} người`;
  const showInlineTyping = activeTypingParticipants.length > 0 && isNearBottom;
  const showFloatingTyping = activeTypingParticipants.length > 0 && !isNearBottom;

  return (
    <div className="flex flex-col h-full bg-chat-surface overflow-hidden relative">
      <PinnedMessagesBanner />

      <div
        ref={scrollRef}
        data-chat-scroll-container={convoId}
        className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden beautiful-scrollbar px-2 md:px-4 pb-8"
      >
        <div ref={contentRef} className="flex min-h-full flex-col">
          <div ref={topSentinelRef} className="h-1 shrink-0" />

        {messageLoading && (
          <div className="flex justify-center py-4 text-sm text-muted-foreground">
            {isJumpMode ? "Đang tải dữ liệu quanh tin nhắn..." : "Đang tải tin nhắn..."}
          </div>
        )}

        {renderedMessages.map(({ message, renderKey, originalIndex, imageBatchItems }) => {
          const isCallMessage = message.type === "system" && message.systemType === "call";
          const isLastMyMsg = message._id === lastMyMessageId || !!imageBatchItems?.some((item) => item._id === lastMyMessageId);

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
              key={`msg-${renderKey || originalIndex}`}
              id={`message-${message._id}`}
              data-message-ids={(imageBatchItems ?? [message]).map((item) => item._id).filter(Boolean).join(" ")}
            >
              <MessageItem
                message={message}
                index={originalIndex}
                messages={messages}
                selectedConvo={selectedConvo}
                currentUserId={user?._id ?? ""}
                isLastMyMessage={isLastMyMsg}
                imageBatchItems={imageBatchItems}
                onReply={setReplyingTo}
              />
            </div>
          );
        })}

          {showInlineTyping && (
            <div className="flex justify-start px-1 pb-2 pt-1 md:px-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <TypingIndicatorPill name={typingDisplayName} />
            </div>
          )}

          <div ref={bottomSentinelRef} className="h-1 shrink-0" />
          <div ref={bottomRef} />
        </div>
      </div>

      {showFloatingTyping && (
        <div className="pointer-events-none absolute bottom-3 left-4 z-30 flex max-w-[calc(100%-7rem)] animate-in fade-in slide-in-from-bottom-2 duration-300 md:left-6">
          <TypingIndicatorPill name={typingDisplayName} />
        </div>
      )}

      {(isJumpMode || showScrollToBottom || pendingNewMessageIds.length > 0) && (
        <button
          onClick={async () => {
            if (isJumpMode) {
              await exitJumpMode(convoId);
              setTimeout(() => {
                scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'auto' });
                setPendingNewMessageIds([]);
              }, 150);
            } else {
              scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'auto' });
              setPendingNewMessageIds([]);
            }
          }}
          className="absolute bottom-6 right-6 z-20 flex h-11 w-11 items-center justify-center 
                     rounded-full bg-white dark:bg-slate-800 shadow-xl border border-slate-200 dark:border-slate-700
                     hover:bg-slate-50 dark:hover:bg-slate-700 transition-all active:scale-90
                     animate-in fade-in slide-in-from-bottom-4 zoom-in-50 duration-300 group"
        >
          {!isJumpMode && pendingNewMessageIds.length > 0 && (
            <span className="absolute -top-2 -right-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold leading-none text-primary-foreground shadow-lg ring-2 ring-background">
              {pendingNewMessageIds.length > 99 ? "99+" : pendingNewMessageIds.length}
            </span>
          )}
          <ChevronsDown className="h-9 w-9 text-slate-600 dark:text-slate-300 group-hover:translate-y-0.5 transition-transform stroke-[1.5px]" />
        </button>
      )}



    </div>
  );
};


export default ChatWindowBody;
