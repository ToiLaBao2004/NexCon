import { useEffect, useMemo, useRef, useState, type ReactNode, type UIEvent } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useChatStore } from "@/stores/useChatStore";
import { chatService } from "@/services/chatService";
import { useDebounce } from "@/hooks/useDebounce";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  Conversation,
  GlobalSearchMessage,
  GlobalSearchPage,
  GlobalSearchResponse,
  GlobalSearchType,
  GlobalSearchUser,
  Message,
} from "@/types/chat";
import { formatMessageTime, removeAccents } from "@/lib/utils";
import { getSystemMessageText } from "@/utils/chatUtils";
import DirectMessageCard from "./DirectMessageCard";
import GroupChatCard from "./GroupChatCard";
import GroupChatAvatar from "./GroupChatAvatar";
import UserAvatar from "./UserAvatar";
import { UserProfileDialog } from "../shared/UserProfileDialog";
import { decodeMentionTokens } from "@/utils/mentions";

export type ConversationFilter = "all" | "unread";

type SearchTab = GlobalSearchType;
type ResultTab = Exclude<SearchTab, "all">;

interface ConversationMixedListProps {
  conversationFilter: ConversationFilter;
  onChangeFilter: (filter: ConversationFilter) => void;
  onCreateGroup: () => void;
}

const DEFAULT_TAB_LIMITS: Record<ResultTab, number> = {
  users: 5,
  conversations: 8,
  messages: 10,
};

const createEmptyPage = <T,>(limit = 0): GlobalSearchPage<T> => ({
  items: [],
  limit,
  hasMore: false,
  nextCursor: null,
});

const createEmptyTabPages = () => ({
  users: createEmptyPage<GlobalSearchUser>(DEFAULT_TAB_LIMITS.users),
  conversations: createEmptyPage<Conversation>(DEFAULT_TAB_LIMITS.conversations),
  messages: createEmptyPage<GlobalSearchMessage>(DEFAULT_TAB_LIMITS.messages),
});

const createLoadingMap = (value = false): Record<ResultTab, boolean> => ({
  users: value,
  conversations: value,
  messages: value,
});

const createFetchedMap = (value = false): Record<SearchTab, boolean> => ({
  all: value,
  users: value,
  conversations: value,
  messages: value,
});

const EMPTY_RESULTS: GlobalSearchResponse = {
  query: "",
  type: "all",
  users: createEmptyPage<GlobalSearchUser>(DEFAULT_TAB_LIMITS.users),
  conversations: createEmptyPage<Conversation>(DEFAULT_TAB_LIMITS.conversations),
  messages: createEmptyPage<GlobalSearchMessage>(DEFAULT_TAB_LIMITS.messages),
};

const SEARCH_TABS: { value: SearchTab; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "users", label: "Người dùng" },
  { value: "conversations", label: "Đoạn chat" },
  { value: "messages", label: "Tin nhắn" },
];

const CONVERSATION_TABS: { value: ConversationFilter; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "unread", label: "Chưa đọc" },
];

const highlightKeyword = (text: string, keyword: string) => {
  if (!keyword.trim() || !text) return <>{text}</>;
  const escaped = keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const exactRegex = new RegExp(`^${escaped}$`, "i");
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, index) =>
        exactRegex.test(part) ? (
          <span key={`${part}-${index}`} className="font-semibold text-primary">
            {part}
          </span>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        )
      )}
    </>
  );
};

type ConversationParticipant = Conversation["participants"][number];
type OpenChatTarget = GlobalSearchUser & { friendId?: string };

const getParticipantId = (participant: ConversationParticipant) => (
  participant?.userId?._id?.toString?.() || participant?.userId?.toString?.() || ""
);

const getConversationTitle = (conversation: Conversation, currentUserId?: string) => {
  if (conversation.type === "group") return conversation.group?.name || "Nhóm";

  const other = conversation.participants.find((participant) => getParticipantId(participant) !== currentUserId);
  const isLocked = Boolean(other?.userId?.isLocked || other?.userId?.lock?.isLocked);
  if (!isLocked && other?.userId?.nickname?.trim()) return other.userId.nickname;
  return other?.userId?.displayName || "Người dùng";
};

const getConversationSubtitle = (conversation: Conversation, currentUserId?: string) => {
  const lastMessage = conversation.lastMessage;
  if (!lastMessage) {
    return conversation.type === "group"
      ? `${conversation.participants.length} thành viên`
      : "Chưa có tin nhắn";
  }

  if (lastMessage.type === "system") {
    return getSystemMessageText(lastMessage, currentUserId || "");
  }

  const senderId = typeof lastMessage.senderId === "object"
    ? lastMessage.senderId?._id
    : lastMessage.senderId;
  const senderIdString = senderId?.toString?.() || "";
  const isOwn = senderIdString === currentUserId;
  const sender = conversation.participants.find((participant) => getParticipantId(participant) === senderIdString);
  const senderName = conversation.type === "group"
    ? (isOwn ? "Bạn" : sender?.userId?.nickname?.trim() || sender?.userId?.displayName || "Ai đó")
    : (isOwn ? "Bạn" : "");

  const content = decodeMentionTokens(lastMessage.content || "", conversation);
  const fallbackByType: Record<string, string> = {
    image: "Đã gửi một ảnh",
    audio: "Tin nhắn thoại",
    file: "Đã gửi một tệp tin",
    link: content || "Đã gửi một liên kết",
    sticker: "Đã gửi một nhãn dán",
  };
  const preview = fallbackByType[lastMessage.type || ""] || content || "";
  return senderName ? `${senderName}: ${preview}` : preview;
};

const normalizeSearchText = (value?: string | null) => removeAccents(value || "").toLowerCase().trim();

const getMatchedGroupMemberLabel = (
  conversation: Conversation,
  keyword: string,
  currentUserId?: string,
) => {
  if (conversation.type !== "group") return "";

  const normalizedKeyword = normalizeSearchText(keyword);
  if (!normalizedKeyword) return "";

  const matchedMembers = conversation.participants
    .filter((participant) => getParticipantId(participant) !== currentUserId)
    .filter((participant) => {
      const user = participant.userId;
      const fields = [
        user?.nickname,
        user?.displayName,
        user?.email,
        user?.phone,
      ];

      return fields.some((field) => normalizeSearchText(field).includes(normalizedKeyword));
    })
    .map((participant) => {
      const user = participant.userId;
      const isLocked = Boolean(user?.isLocked || user?.lock?.isLocked);
      if (!isLocked && user?.nickname?.trim()) return user.nickname.trim();
      return user?.displayName || "";
    })
    .filter(Boolean);

  if (matchedMembers.length === 0) return "";
  if (matchedMembers.length <= 2) return matchedMembers.join(", ");
  return `${matchedMembers.slice(0, 2).join(", ")} +${matchedMembers.length - 2}`;
};

type MessagePreviewLike = Pick<Message, "type" | "systemType" | "metadata" | "content" | "fileName" | "mentions">;

const getMessagePreview = (message: MessagePreviewLike, currentUserId?: string, source?: Conversation) => {
  if (message.type === "system") {
    return getSystemMessageText(message, currentUserId || "");
  }

  if (message.content?.trim()) return decodeMentionTokens(message.content, source, message.mentions);
  if (message.fileName) return message.fileName;

  const fallbackByType: Record<string, string> = {
    image: "Ảnh",
    audio: "Tin nhắn thoại",
    file: "Tệp tin",
    link: "Liên kết",
    sticker: "Nhãn dán",
  };

  return fallbackByType[message.type] || "Tin nhắn";
};

const rememberConversation = (conversation: Conversation) => {
  useChatStore.setState((state) => {
    const existing = state.conversations.find((item) => item._id === conversation._id);
    const mergedConversation = existing
      ? {
          ...existing,
          ...conversation,
          isPinned: existing.isPinned,
          pinnedAt: existing.pinnedAt,
        }
      : conversation;

    const nextConversations = [
      mergedConversation,
      ...state.conversations.filter((item) => item._id !== conversation._id),
    ].sort((a, b) => {
      const aPinned = a.isPinned === true;
      const bPinned = b.isPinned === true;
      if (aPinned !== bPinned) return aPinned ? -1 : 1;

      if (aPinned && bPinned) {
        const aPinnedAt = new Date(a.pinnedAt || 0).getTime();
        const bPinnedAt = new Date(b.pinnedAt || 0).getTime();
        if (aPinnedAt !== bPinnedAt) return bPinnedAt - aPinnedAt;
      }

      const aTime = new Date(a.lastMessage?.createdAt || a.updatedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.lastMessage?.createdAt || b.updatedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    });

    return { conversations: nextConversations };
  });
};

const appendUniqueById = <T extends { _id: string }>(current: T[], incoming: T[]) => {
  const seen = new Set(current.map((item) => item._id));
  const next = [...current];

  for (const item of incoming) {
    if (seen.has(item._id)) continue;
    seen.add(item._id);
    next.push(item);
  }

  return next;
};

function SearchResultSkeleton() {
  return (
    <div className="space-y-3 px-1 py-2">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="flex items-center gap-3 rounded-lg px-1 py-2">
          <Skeleton className="h-11 w-11 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-5/6" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptySearchState({ keyword }: { keyword: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center text-muted-foreground">
      <Search className="mb-3 h-10 w-10 opacity-25" strokeWidth={1.6} />
      <p className="text-sm">
        Không có kết quả cho <span className="font-medium text-foreground">"{keyword}"</span>
      </p>
    </div>
  );
}

function ResultSection({
  title,
  count,
  children,
  hasMore,
  onMore,
}: {
  title: string;
  count: number;
  children: ReactNode;
  hasMore?: boolean;
  onMore?: () => void;
}) {
  if (count <= 0) return null;

  return (
    <section className="pb-2">
      <div className="flex items-center justify-between px-1 pb-1.5 pt-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title} ({count})
        </h3>
      </div>
      <div className="space-y-1">{children}</div>
      {hasMore && onMore && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={onMore}
            className="rounded-full px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10"
          >
            Xem tất cả
          </button>
        </div>
      )}
    </section>
  );
}

function UserResultRow({
  user,
  keyword,
  onOpen,
}: {
  user: GlobalSearchUser;
  keyword: string;
  onOpen: () => void;
}) {
  const locked = Boolean(user.isLocked || user.lock?.isLocked);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted/50"
    >
      <UserAvatar
        type="chat"
        name={user.displayName}
        avatarUrl={user.avatarUrl || undefined}
        className="!h-11 !w-11 !text-base"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold leading-tight text-foreground">
          {highlightKeyword(user.displayName, keyword)}
        </p>
        <p className="mt-1 truncate text-[13px] text-muted-foreground">
          {locked ? "Tài khoản bị khóa" : highlightKeyword(user.email || user.phone || "", keyword)}
        </p>
      </div>
    </button>
  );
}

function ConversationResultRow({
  conversation,
  keyword,
  currentUserId,
  onOpen,
}: {
  conversation: Conversation;
  keyword: string;
  currentUserId?: string;
  onOpen: () => void;
}) {
  const title = getConversationTitle(conversation, currentUserId);
  const matchedGroupMember = getMatchedGroupMemberLabel(conversation, keyword, currentUserId);
  const subtitle = matchedGroupMember
    ? `Thành viên: ${matchedGroupMember}`
    : getConversationSubtitle(conversation, currentUserId);
  const other = conversation.type === "direct"
    ? conversation.participants.find((participant) => getParticipantId(participant) !== currentUserId)
    : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted/50"
    >
      {conversation.type === "group" ? (
        <GroupChatAvatar participants={conversation.participants} type="card" groupAvatarUrl={conversation.group?.avatarUrl} />
      ) : (
        <UserAvatar
          type="chat"
          name={title}
          avatarUrl={other?.userId?.avatarUrl || undefined}
          className="!h-11 !w-11 !text-base"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold leading-tight text-foreground">
          {highlightKeyword(title, keyword)}
        </p>
        <p className="mt-1 truncate text-[13px] text-muted-foreground">
          {highlightKeyword(subtitle, keyword)}
        </p>
      </div>
      {conversation.lastMessage?.createdAt && (
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatMessageTime(new Date(conversation.lastMessage.createdAt))}
        </span>
      )}
    </button>
  );
}

function MessageResultRow({
  message,
  keyword,
  currentUserId,
  onOpen,
}: {
  message: GlobalSearchMessage;
  keyword: string;
  currentUserId?: string;
  onOpen: () => void;
}) {
  const rawSender = message.senderId;
  const sender = rawSender && typeof rawSender === "object" ? rawSender : message.senderInfo;
  const senderId = rawSender && typeof rawSender === "object" ? rawSender._id : rawSender;
  const isOwnSender = senderId?.toString?.() === currentUserId;
  const senderParticipant = message.conversation?.participants?.find(
    (participant) => (participant.userId?._id || participant.userId)?.toString?.() === senderId?.toString?.()
  );
  const senderName = isOwnSender
    ? "Bạn"
    : senderParticipant?.userId?.nickname?.trim() || sender?.displayName || "Người dùng";
  const conversationName = getConversationTitle(message.conversation, currentUserId);
  const content = getMessagePreview(message, currentUserId, message.conversation);
  const isGroupMessage = message.conversation?.type === "group";

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted/50"
    >
      {isGroupMessage ? (
        <GroupChatAvatar
          participants={message.conversation.participants}
          type="card"
          groupAvatarUrl={message.conversation.group?.avatarUrl}
        />
      ) : (
        <UserAvatar
          type="chat"
          name={senderName}
          avatarUrl={sender?.avatarUrl || undefined}
          className="!h-10 !w-10 !text-sm"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-[14px] font-semibold text-foreground">
            {isGroupMessage ? conversationName : senderName}
          </p>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatMessageTime(new Date(message.createdAt))}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-foreground/80">
          {isGroupMessage && <span className="text-muted-foreground">{senderName}: </span>}
          {highlightKeyword(content, keyword)}
        </p>
      </div>
    </button>
  );
}

const ConversationMixedList = ({
  conversationFilter,
  onChangeFilter,
  onCreateGroup,
}: ConversationMixedListProps) => {
  const {
    conversations,
    fetchConversations,
    fetchMoreConversations,
    conversationsHasMore,
    convoLoading,
    setFocusedConversation,
    setActiveConversation,
    fetchMessages,
    messages,
    jumpToMessage,
    openChat,
  } = useChatStore();
  const { user } = useAuthStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchTab, setSearchTab] = useState<SearchTab>("all");
  const [globalResults, setGlobalResults] = useState<GlobalSearchResponse>(EMPTY_RESULTS);
  const [tabPages, setTabPages] = useState(createEmptyTabPages);
  const [tabLoading, setTabLoading] = useState(createLoadingMap);
  const [tabLoadingMore, setTabLoadingMore] = useState(createLoadingMap);
  const [loadMoreErrorTab, setLoadMoreErrorTab] = useState<ResultTab | null>(null);
  const [isGlobalSearching, setIsGlobalSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [profileUser, setProfileUser] = useState<GlobalSearchUser | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const cacheKeywordRef = useRef("");
  const fetchedTabsRef = useRef(createFetchedMap(false));
  const conversationItems = useMemo(() => conversations ?? [], [conversations]);
  const currentUserId = user?._id?.toString();
  const debouncedQuery = useDebounce(searchQuery, 300);
  const trimmedQuery = searchQuery.trim();
  const trimmedDebouncedQuery = debouncedQuery.trim();
  const hasQuery = trimmedQuery.length > 0;
  const resultMatchesQuery = globalResults.query.trim() === trimmedDebouncedQuery && globalResults.type === "all";
  const resultData = hasQuery && resultMatchesQuery ? globalResults : EMPTY_RESULTS;
  const isWaitingForDebounce = hasQuery && trimmedQuery !== trimmedDebouncedQuery;
  const hasFreshSearchCache = !hasQuery || cacheKeywordRef.current === trimmedDebouncedQuery;
  const activeSearchTabNeedsFetch = hasQuery
    && !isWaitingForDebounce
    && hasFreshSearchCache
    && !fetchedTabsRef.current[searchTab];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (conversationItems.length === 0) {
      fetchConversations();
    }
  }, [conversationItems.length, fetchConversations]);

  useEffect(() => {
    if (!trimmedQuery) {
      setSearchTab("all");
      setGlobalResults(EMPTY_RESULTS);
      setTabPages(createEmptyTabPages());
      setTabLoading(createLoadingMap(false));
      setTabLoadingMore(createLoadingMap(false));
      fetchedTabsRef.current = createFetchedMap(false);
      cacheKeywordRef.current = "";
      setLoadMoreErrorTab(null);
      setSearchError("");
    }
  }, [trimmedQuery]);

  useEffect(() => {
    const keyword = trimmedDebouncedQuery;

    if (!keyword) {
      setIsGlobalSearching(false);
      setTabLoading(createLoadingMap(false));
      setSearchError("");
      return;
    }

    const type = searchTab;
    const keywordChanged = cacheKeywordRef.current !== keyword;

    if (keywordChanged) {
      cacheKeywordRef.current = keyword;
      fetchedTabsRef.current = createFetchedMap(false);
      setGlobalResults(EMPTY_RESULTS);
      setTabPages(createEmptyTabPages());
      setTabLoadingMore(createLoadingMap(false));
      setLoadMoreErrorTab(null);
    } else if (fetchedTabsRef.current[type]) {
      setIsGlobalSearching(false);
      setTabLoading(createLoadingMap(false));
      setSearchError("");
      return;
    }

    const controller = new AbortController();
    let active = true;

    if (type === "all") {
      setIsGlobalSearching(true);
      setTabLoading(createLoadingMap(false));
    } else {
      setIsGlobalSearching(false);
      setTabLoading((prev) => ({ ...prev, [type]: true }));
    }
    setSearchError("");

    chatService.globalSearch(keyword, { signal: controller.signal, type })
      .then((response) => {
        if (!active) return;
        if (type === "all") {
          setGlobalResults(response);
          fetchedTabsRef.current = { ...fetchedTabsRef.current, all: true };
          return;
        }

        setTabPages((prev) => ({ ...prev, [type]: response[type] }));
        fetchedTabsRef.current = { ...fetchedTabsRef.current, [type]: true };
      })
      .catch((error) => {
        if (!active || error?.code === "ERR_CANCELED" || error?.name === "CanceledError") return;
        if (type === "all") {
          setGlobalResults({ ...EMPTY_RESULTS, query: keyword, type: "all" });
        }
        setSearchError("Không thể tìm kiếm lúc này. Vui lòng thử lại.");
      })
      .finally(() => {
        if (!active) return;

        if (type === "all") {
          setIsGlobalSearching(false);
        } else {
          setTabLoading((prev) => ({ ...prev, [type]: false }));
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [searchTab, trimmedDebouncedQuery]);

  const filteredConversations = useMemo(() => {
    return conversationItems.filter((conversation) => {
      if (conversationFilter !== "unread") return true;
      const unreadCount = currentUserId ? Number(conversation.unreadCounts?.[currentUserId] || 0) : 0;
      return unreadCount > 0;
    });
  }, [conversationFilter, conversationItems, currentUserId]);

  const loadMoreSearchTab = async (tab: ResultTab) => {
    const keyword = trimmedDebouncedQuery;
    const page = tabPages[tab];

    if (!keyword || tabLoading[tab] || tabLoadingMore[tab] || !page.hasMore || !page.nextCursor) return;

    setTabLoadingMore((prev) => ({ ...prev, [tab]: true }));
    setLoadMoreErrorTab(null);
    setSearchError("");

    try {
      const response = await chatService.globalSearch(keyword, {
        type: tab,
        cursor: page.nextCursor,
        limit: page.limit || DEFAULT_TAB_LIMITS[tab],
      });

      if (tab === "users") {
        setTabPages((prev) => ({
          ...prev,
          users: {
            ...response.users,
            items: appendUniqueById(prev.users.items, response.users.items),
          },
        }));
      } else if (tab === "conversations") {
        setTabPages((prev) => ({
          ...prev,
          conversations: {
            ...response.conversations,
            items: appendUniqueById(prev.conversations.items, response.conversations.items),
          },
        }));
      } else {
        setTabPages((prev) => ({
          ...prev,
          messages: {
            ...response.messages,
            items: appendUniqueById(prev.messages.items, response.messages.items),
          },
        }));
      }
    } catch (error: unknown) {
      const requestError = error as { code?: string; name?: string } | null;
      if (requestError?.code === "ERR_CANCELED" || requestError?.name === "CanceledError") return;
      setLoadMoreErrorTab(tab);
    } finally {
      setTabLoadingMore((prev) => ({ ...prev, [tab]: false }));
    }
  };

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;

    if (hasQuery) {
      if (searchTab !== "all" && target.scrollTop + target.clientHeight >= target.scrollHeight - 80) {
        void loadMoreSearchTab(searchTab);
      }
      return;
    }

    if (convoLoading || !conversationsHasMore) return;

    if (target.scrollTop + target.clientHeight >= target.scrollHeight * 0.7) {
      void fetchMoreConversations();
    }
  };

  const clearGlobalSearch = () => {
    setSearchQuery("");
    setSearchTab("all");
    setGlobalResults(EMPTY_RESULTS);
    setTabPages(createEmptyTabPages());
    setTabLoading(createLoadingMap(false));
    setTabLoadingMore(createLoadingMap(false));
    fetchedTabsRef.current = createFetchedMap(false);
    cacheKeywordRef.current = "";
    setLoadMoreErrorTab(null);
    setSearchError("");
    searchInputRef.current?.focus();
  };

  const handleOpenConversation = async (conversation: Conversation) => {
    rememberConversation(conversation);
    setActiveConversation(conversation._id);

    if (!messages[conversation._id]) {
      await fetchMessages(conversation._id);
    }
  };

  const handleOpenMessage = async (message: GlobalSearchMessage) => {
    if (!message.conversation?._id) return;

    rememberConversation(message.conversation);
    setActiveConversation(message.conversation._id);
    await jumpToMessage(message.conversation._id, message._id);
  };

  const handleOpenChatFromProfile = async (targetUser: OpenChatTarget) => {
    const userId = targetUser.friendId || targetUser._id;
    if (!userId) return;

    setProfileUser(null);
    await openChat({ userId });
  };

  const renderLoadMoreControls = (tab: ResultTab) => {
    const page = tabPages[tab];
    const isLoadingMore = tabLoadingMore[tab];

    if (!page.hasMore && !isLoadingMore) return null;

    return (
      <div className="flex flex-col items-center gap-2 py-3">
        {loadMoreErrorTab === tab && (
          <p className="text-xs text-muted-foreground">Không thể tải thêm kết quả</p>
        )}
        {isLoadingMore ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <button
            type="button"
            onClick={() => void loadMoreSearchTab(tab)}
            className="rounded-full px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10"
          >
            Tải thêm
          </button>
        )}
      </div>
    );
  };

  const renderSearchResults = () => {
    if (
      isWaitingForDebounce
      || !hasFreshSearchCache
      || activeSearchTabNeedsFetch
      || (searchTab === "all" && isGlobalSearching)
    ) {
      return <SearchResultSkeleton />;
    }

    if (searchError) {
      return (
        <div className="px-6 py-12 text-center text-sm text-destructive">
          {searchError}
        </div>
      );
    }

    const hasAllResults = resultData.users.items.length > 0
      || resultData.conversations.items.length > 0
      || resultData.messages.items.length > 0;

    if (searchTab === "all" && !hasAllResults) {
      return <EmptySearchState keyword={trimmedQuery} />;
    }

    if (searchTab === "users") {
      const page = tabPages.users;

      if (tabLoading.users && page.items.length === 0) {
        return <SearchResultSkeleton />;
      }

      return page.items.length > 0 ? (
        <div className="space-y-1">
          {page.items.map((item) => (
            <UserResultRow key={item._id} user={item} keyword={trimmedQuery} onOpen={() => setProfileUser(item)} />
          ))}
          {renderLoadMoreControls("users")}
        </div>
      ) : <EmptySearchState keyword={trimmedQuery} />;
    }

    if (searchTab === "conversations") {
      const page = tabPages.conversations;

      if (tabLoading.conversations && page.items.length === 0) {
        return <SearchResultSkeleton />;
      }

      return page.items.length > 0 ? (
        <div className="space-y-1">
          {page.items.map((item) => (
            <ConversationResultRow
              key={item._id}
              conversation={item}
              keyword={trimmedQuery}
              currentUserId={currentUserId}
              onOpen={() => void handleOpenConversation(item)}
            />
          ))}
          {renderLoadMoreControls("conversations")}
        </div>
      ) : <EmptySearchState keyword={trimmedQuery} />;
    }

    if (searchTab === "messages") {
      const page = tabPages.messages;

      if (tabLoading.messages && page.items.length === 0) {
        return <SearchResultSkeleton />;
      }

      return page.items.length > 0 ? (
        <div className="space-y-1">
          {page.items.map((item) => (
            <MessageResultRow
              key={item._id}
              message={item}
              keyword={trimmedQuery}
              currentUserId={currentUserId}
              onOpen={() => void handleOpenMessage(item)}
            />
          ))}
          {renderLoadMoreControls("messages")}
        </div>
      ) : <EmptySearchState keyword={trimmedQuery} />;
    }

    return (
      <div className="space-y-1">
        <ResultSection title="Người dùng" count={resultData.users.items.length} hasMore={resultData.users.hasMore} onMore={() => setSearchTab("users")}>
          {resultData.users.items.map((item) => (
            <UserResultRow key={item._id} user={item} keyword={trimmedQuery} onOpen={() => setProfileUser(item)} />
          ))}
        </ResultSection>

        <ResultSection title="Đoạn chat" count={resultData.conversations.items.length} hasMore={resultData.conversations.hasMore} onMore={() => setSearchTab("conversations")}>
          {resultData.conversations.items.map((item) => (
            <ConversationResultRow
              key={item._id}
              conversation={item}
              keyword={trimmedQuery}
              currentUserId={currentUserId}
              onOpen={() => void handleOpenConversation(item)}
            />
          ))}
        </ResultSection>

        <ResultSection title="Tin nhắn" count={resultData.messages.items.length} hasMore={resultData.messages.hasMore} onMore={() => setSearchTab("messages")}>
          {resultData.messages.items.map((item) => (
            <MessageResultRow
              key={item._id}
              message={item}
              keyword={trimmedQuery}
              currentUserId={currentUserId}
              onOpen={() => void handleOpenMessage(item)}
            />
          ))}
        </ResultSection>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 bg-card pb-2 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-foreground" strokeWidth={1.65} />
          <Input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Tìm người dùng, đoạn chat, tin nhắn"
            className="h-11 rounded-xl border-border/60 bg-muted/30 pl-10 pr-9 text-[15px] shadow-sm focus-visible:ring-1 focus-visible:ring-primary/40"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={clearGlobalSearch}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Xóa tìm kiếm"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 pt-3">
          <div className="flex min-w-0 items-center gap-4 overflow-x-auto beautiful-scrollbar">
            {(hasQuery ? SEARCH_TABS : CONVERSATION_TABS).map((item) => {
              const active = hasQuery
                ? searchTab === item.value
                : conversationFilter === item.value;

              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    if (hasQuery) {
                      setSearchTab(item.value as SearchTab);
                    } else {
                      onChangeFilter(item.value as ConversationFilter);
                    }
                  }}
                  className={`relative h-8 shrink-0 px-0 text-sm text-foreground transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary after:transition-opacity ${
                    active
                      ? "font-semibold after:opacity-100"
                      : "font-normal after:opacity-0 hover:text-foreground/80"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {!hasQuery && (
            <button
              type="button"
              onClick={onCreateGroup}
              className="shrink-0 rounded-full border border-border/60 bg-background px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted/50"
            >
              Tạo nhóm
            </button>
          )}
        </div>
      </div>

      <div
        className="stable-y-scroll min-h-0 flex-1 overflow-y-auto beautiful-scrollbar pb-4 pt-1.5"
        onScroll={handleScroll}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) {
            setFocusedConversation(null);
          }
        }}
      >
        {hasQuery ? (
          <div className="space-y-2">{renderSearchResults()}</div>
        ) : filteredConversations.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {conversationFilter === "unread" ? "Không có cuộc trò chuyện chưa đọc" : "Chưa có cuộc trò chuyện nào"}
          </div>
        ) : (
          <div className="space-y-1.5">
            {filteredConversations.map((conversation) =>
              conversation.type === "group" ? (
                <GroupChatCard convo={conversation} key={conversation._id} density="people" />
              ) : (
                <DirectMessageCard convo={conversation} key={conversation._id} density="people" />
              )
            )}
          </div>
        )}

        {!hasQuery && convoLoading && conversationItems.length > 0 && (
          <div className="flex justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      <UserProfileDialog
        open={Boolean(profileUser)}
        onOpenChange={(open) => {
          if (!open) setProfileUser(null);
        }}
        user={profileUser ? {
          _id: profileUser._id,
          displayName: profileUser.displayName,
          email: profileUser.email || "",
          avatarUrl: profileUser.avatarUrl || undefined,
          bio: profileUser.bio || undefined,
          phone: profileUser.phone || undefined,
        } : null}
        onOpenChat={handleOpenChatFromProfile}
      />
    </div>
  );
};

export default ConversationMixedList;
