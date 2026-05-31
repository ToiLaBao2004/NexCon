import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type UIEvent } from "react";
import { Search, X, Loader2, User, Users, Plus } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useChatStore } from "@/stores/useChatStore";
import { useFriendStore } from "@/stores/useFriendStore";
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
import { SHOW_CONVERSATION_LIST_EVENT } from "@/constants/chatEvents";
import type { FriendItem } from "@/types/user";
import { DISAPPEARED_MESSAGE_PLACEHOLDER, isMessageExpired } from "@/utils/disappearingMessages";

export type ConversationFilter = "all" | "unread";

type SearchTab = GlobalSearchType;
type ResultTab = Exclude<SearchTab, "all">;

interface ConversationMixedListProps {
  conversationFilter: ConversationFilter;
  onChangeFilter: (filter: ConversationFilter) => void;
  onAddFriend: () => void;
  onCreateGroup: () => void;
}

const DEFAULT_TAB_LIMITS: Record<ResultTab, number> = {
  users: 5,
  conversations: 8,
  messages: 10,
};
const GLOBAL_SEARCH_DEBOUNCE_MS = 300;

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

  if (isMessageExpired(lastMessage)) {
    return DISAPPEARED_MESSAGE_PLACEHOLDER;
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

type MessagePreviewLike = Pick<Message, "type" | "systemType" | "metadata" | "content" | "fileName" | "mentions" | "isExpired" | "expiresAt">;

const getMessagePreview = (message: MessagePreviewLike, currentUserId?: string, source?: Conversation) => {
  if (isMessageExpired(message)) {
    return DISAPPEARED_MESSAGE_PLACEHOLDER;
  }

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

const mergeUniqueById = <T extends { _id: string }>(primary: T[], secondary: T[]) => {
  const seen = new Set(primary.map((item) => item._id));
  return [
    ...primary,
    ...secondary.filter((item) => {
      if (seen.has(item._id)) return false;
      seen.add(item._id);
      return true;
    }),
  ];
};

const buildPage = <T,>(items: T[], limit: number, hasMore = false, nextCursor: string | null = null): GlobalSearchPage<T> => ({
  items,
  limit,
  hasMore,
  nextCursor: hasMore ? nextCursor : null,
});

const getFriendSearchText = (friend: FriendItem) => {
  const raw = friend as FriendItem & { email?: string; phone?: string; bio?: string };
  return normalizeSearchText([
    raw.nickname,
    raw.displayName,
    raw.email,
    raw.phone,
    raw.bio,
  ].filter(Boolean).join(" "));
};

const searchFriendsCache = (friends: FriendItem[], keyword: string, limit = DEFAULT_TAB_LIMITS.users) => {
  const normalizedKeyword = normalizeSearchText(keyword);
  if (!normalizedKeyword) return buildPage<GlobalSearchUser>([], limit);

  const matches = friends
    .filter((friend) => getFriendSearchText(friend).includes(normalizedKeyword))
    .map((friend) => {
      const raw = friend as FriendItem & { email?: string; phone?: string; bio?: string };
      return {
        _id: friend.friendId,
        displayName: friend.nickname?.trim() || friend.displayName,
        email: raw.email,
        avatarUrl: friend.avatarUrl || null,
        phone: raw.phone,
        bio: raw.bio,
      } satisfies GlobalSearchUser;
    });

  return buildPage(matches.slice(0, limit), limit, matches.length > limit, null);
};

const searchConversationsCache = (
  conversations: Conversation[],
  keyword: string,
  currentUserId?: string,
  limit = DEFAULT_TAB_LIMITS.conversations,
) => {
  const normalizedKeyword = normalizeSearchText(keyword);
  if (!normalizedKeyword) return buildPage<Conversation>([], limit);

  const matches = conversations.filter((conversation) => {
    const searchableText = normalizeSearchText([
      getConversationTitle(conversation, currentUserId),
      getConversationSubtitle(conversation, currentUserId),
      getMatchedGroupMemberLabel(conversation, keyword, currentUserId),
    ].filter(Boolean).join(" "));
    return searchableText.includes(normalizedKeyword);
  });

  return buildPage(matches.slice(0, limit), limit, matches.length > limit, null);
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

function SearchSectionSkeleton({ title, rows = 2 }: { title: string; rows?: number }) {
  return (
    <section className="pb-2">
      <div className="px-1 pb-1.5 pt-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
      </div>
      <div className="space-y-3 px-1 py-1">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex items-center gap-3 rounded-lg px-1 py-2">
            <Skeleton className="h-11 w-11 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-5/6" />
            </div>
          </div>
        ))}
      </div>
    </section>
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
  onAddFriend,
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
  const { friends } = useFriendStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchTab, setSearchTab] = useState<SearchTab>("all");
  const [globalResults, setGlobalResults] = useState<GlobalSearchResponse>(EMPTY_RESULTS);
  const [tabPages, setTabPages] = useState(createEmptyTabPages);
  const [tabLoading, setTabLoading] = useState(createLoadingMap);
  const [tabLoadingMore, setTabLoadingMore] = useState(createLoadingMap);
  const [loadMoreErrorTab, setLoadMoreErrorTab] = useState<ResultTab | null>(null);
  const [searchError, setSearchError] = useState("");
  const [profileUser, setProfileUser] = useState<GlobalSearchUser | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const cacheKeywordRef = useRef("");
  const fetchedTabsRef = useRef(createFetchedMap(false));
  const scrollPositionsRef = useRef<Record<string, number>>({});
  const suppressAutoLoadUntilRef = useRef(0);
  const conversationItems = useMemo(() => conversations ?? [], [conversations]);
  const currentUserId = user?._id?.toString();
  const debouncedQuery = useDebounce(searchQuery, GLOBAL_SEARCH_DEBOUNCE_MS);
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
  const activeScrollKey = hasQuery
    ? `search:${trimmedQuery}:${searchTab}`
    : `conversations:${conversationFilter}`;

  const resetGlobalSearch = useCallback((focusInput = false) => {
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
    if (focusInput) {
      searchInputRef.current?.focus();
    }
  }, []);

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
    const handleShowConversationList = () => {
      resetGlobalSearch(false);
    };

    window.addEventListener(SHOW_CONVERSATION_LIST_EVENT, handleShowConversationList);
    return () => window.removeEventListener(SHOW_CONVERSATION_LIST_EVENT, handleShowConversationList);
  }, [resetGlobalSearch]);

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
    const container = scrollContainerRef.current;
    if (!container) return;

    suppressAutoLoadUntilRef.current = Date.now() + 300;
    const nextTop = scrollPositionsRef.current[activeScrollKey] || 0;
    const frame = window.requestAnimationFrame(() => {
      container.scrollTop = nextTop;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeScrollKey]);

  useEffect(() => {
    const keyword = trimmedDebouncedQuery;

    if (!keyword) {
      setTabLoading(createLoadingMap(false));
      setSearchError("");
      return;
    }

    const type = searchTab;
    const keywordChanged = cacheKeywordRef.current !== keyword;
    const cachedUsers = searchFriendsCache(
      friends,
      keyword,
      type === "users" ? Math.max(friends.length, DEFAULT_TAB_LIMITS.users) : DEFAULT_TAB_LIMITS.users,
    );
    const cachedConversations = searchConversationsCache(
      conversationItems,
      keyword,
      currentUserId,
      DEFAULT_TAB_LIMITS.conversations,
    );

    if (keywordChanged) {
      cacheKeywordRef.current = keyword;
      fetchedTabsRef.current = createFetchedMap(false);
      setGlobalResults(EMPTY_RESULTS);
      setTabPages(createEmptyTabPages());
      setTabLoadingMore(createLoadingMap(false));
      setLoadMoreErrorTab(null);
    } else if (fetchedTabsRef.current[type]) {
      setSearchError("");
      return;
    }

    const controller = new AbortController();
    let active = true;

    if (type === "users") {
      setTabLoading((prev) => ({ ...prev, users: false }));
      setTabPages((prev) => ({ ...prev, users: cachedUsers }));
      fetchedTabsRef.current = { ...fetchedTabsRef.current, users: true };
      setSearchError("");
      return;
    }

    if (type === "all") {
      setGlobalResults({
        ...EMPTY_RESULTS,
        query: keyword,
        type: "all",
        users: cachedUsers,
        conversations: cachedConversations,
      });
      setTabPages((prev) => ({
        ...prev,
        users: cachedUsers,
        conversations: cachedConversations,
      }));
      fetchedTabsRef.current = { ...fetchedTabsRef.current, all: true };
      setTabLoading({ users: false, conversations: true, messages: true });
      setSearchError("");
      let allSearchFinished = false;
      const isCanceled = (error: { code?: string; name?: string } | null | undefined) => (
        error?.code === "ERR_CANCELED" || error?.name === "CanceledError" || error?.name === "AbortError"
      );

      void (async () => {
        try {
          await chatService.globalSearchStream(keyword, {
            signal: controller.signal,
            conversationLimit: DEFAULT_TAB_LIMITS.conversations,
            messageLimit: DEFAULT_TAB_LIMITS.messages,
            onChunk: (chunk) => {
              if (!active) return;

              if (chunk.type === "conversations") {
                const mergedConversations = mergeUniqueById(cachedConversations.items, chunk.conversations.items);
                const conversationsPage = {
                  ...chunk.conversations,
                  items: mergedConversations,
                  hasMore: chunk.conversations.hasMore || cachedConversations.hasMore,
                };
                setGlobalResults((prev) => (
                  prev.query.trim() === keyword
                    ? { ...prev, conversations: conversationsPage }
                    : { ...EMPTY_RESULTS, query: keyword, type: "all", conversations: conversationsPage }
                ));
                setTabPages((prev) => ({ ...prev, conversations: conversationsPage }));
                fetchedTabsRef.current = { ...fetchedTabsRef.current, conversations: true };
                setTabLoading((prev) => ({ ...prev, conversations: false, messages: true }));
                return;
              }

              if (chunk.type === "messages") {
                setGlobalResults((prev) => (
                  prev.query.trim() === keyword
                    ? { ...prev, messages: chunk.messages }
                    : { ...EMPTY_RESULTS, query: keyword, type: "all", messages: chunk.messages }
                ));
                setTabPages((prev) => ({ ...prev, messages: chunk.messages }));
                fetchedTabsRef.current = { ...fetchedTabsRef.current, messages: true };
                setTabLoading((prev) => ({ ...prev, messages: false }));
                return;
              }

              if (chunk.type === "done") {
                allSearchFinished = true;
                fetchedTabsRef.current = { ...fetchedTabsRef.current, all: true };
                setTabLoading(createLoadingMap(false));
                return;
              }

              if (chunk.type === "error") {
                throw new Error(chunk.message);
              }
            },
          });
        } catch (error: unknown) {
          if (!active || isCanceled(error as { code?: string; name?: string })) return;
          fetchedTabsRef.current = {
            ...fetchedTabsRef.current,
            all: false,
            conversations: false,
            messages: false,
          };
          setSearchError("Không thể tìm kiếm lúc này. Vui lòng thử lại.");
        } finally {
          if (!active) return;
          if (!allSearchFinished) {
            setTabLoading(createLoadingMap(false));
          }
        }
      })();

      return () => {
        active = false;
        controller.abort();
        if (!allSearchFinished) {
          fetchedTabsRef.current = { ...fetchedTabsRef.current, all: false, messages: false };
        }
      };
    }

    setTabLoading((prev) => ({ ...prev, [type]: true }));
    setSearchError("");

    if (type === "conversations") {
      setTabPages((prev) => ({ ...prev, conversations: cachedConversations }));
    }

    chatService.globalSearch(keyword, { signal: controller.signal, type })
      .then((response) => {
        if (!active) return;
        if (type === "conversations") {
          setTabPages((prev) => ({
            ...prev,
            conversations: {
              ...response.conversations,
              items: mergeUniqueById(cachedConversations.items, response.conversations.items),
              hasMore: response.conversations.hasMore || cachedConversations.hasMore,
            },
          }));
        } else {
          setTabPages((prev) => ({ ...prev, [type]: response[type] }));
        }
        fetchedTabsRef.current = { ...fetchedTabsRef.current, [type]: true };
      })
      .catch((error) => {
        if (!active || error?.code === "ERR_CANCELED" || error?.name === "CanceledError") return;
        setSearchError("Không thể tìm kiếm lúc này. Vui lòng thử lại.");
      })
      .finally(() => {
        if (!active) return;

        setTabLoading((prev) => ({ ...prev, [type]: false }));
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [conversationItems, currentUserId, friends, searchTab, trimmedDebouncedQuery]);

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

    if (!keyword || tabLoading[tab] || tabLoadingMore[tab]) return;

    if (tab === "users") {
      const cachedUsers = searchFriendsCache(
        friends,
        keyword,
        Math.max(friends.length, DEFAULT_TAB_LIMITS.users),
      );
      setTabPages((prev) => ({ ...prev, users: cachedUsers }));
      fetchedTabsRef.current = { ...fetchedTabsRef.current, users: true };
      return;
    }

    if (!page.hasMore || !page.nextCursor) return;

    setTabLoadingMore((prev) => ({ ...prev, [tab]: true }));
    setLoadMoreErrorTab(null);
    setSearchError("");

    try {
      const response = await chatService.globalSearch(keyword, {
        type: tab,
        cursor: page.nextCursor,
        limit: page.limit || DEFAULT_TAB_LIMITS[tab],
      });

      if (tab === "conversations") {
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
    scrollPositionsRef.current[activeScrollKey] = target.scrollTop;

    if (Date.now() < suppressAutoLoadUntilRef.current) {
      return;
    }

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

  const clearGlobalSearch = () => resetGlobalSearch(true);

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
    const isAllUserSearchLoading = searchTab === "all" && tabLoading.users;
    const isAllConversationSearchLoading = searchTab === "all" && tabLoading.conversations;
    const isAllMessageSearchLoading = searchTab === "all" && tabLoading.messages;
    const isAllSearchLoading = isAllUserSearchLoading || isAllConversationSearchLoading || isAllMessageSearchLoading;

    if (searchTab === "all" && !hasAllResults && !isAllSearchLoading) {
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

        {isAllConversationSearchLoading && resultData.conversations.items.length === 0 && (
          <SearchSectionSkeleton title="Đoạn chat" rows={2} />
        )}

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

        {isAllMessageSearchLoading && resultData.messages.items.length === 0 && (
          <SearchSectionSkeleton title="Tin nhắn" rows={2} />
        )}
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

        <div className="-mx-5 flex items-center justify-between gap-3 border-b border-border/50 px-5 pt-3">
          <div className="beautiful-scrollbar flex min-w-0 items-center gap-4 overflow-x-auto overflow-y-hidden">
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
                  className={`relative h-8 shrink-0 px-0 text-sm text-foreground transition-colors after:absolute after:inset-x-0 after:bottom-0 after:z-10 after:h-0.5 after:rounded-full after:bg-primary after:transition-opacity ${
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
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={onAddFriend}
                aria-label="Thêm bạn"
                title="Thêm bạn"
                className="relative flex size-7 items-center justify-center rounded-md text-slate-950 transition-colors hover:bg-muted/60 dark:text-foreground"
              >
                <User className="h-[18px] w-[18px]" strokeWidth={1.55} />
                <Plus className="absolute right-0 top-0 h-2.5 w-2.5" strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={onCreateGroup}
                aria-label="Tạo nhóm"
                title="Tạo nhóm"
                className="relative flex size-7 items-center justify-center rounded-md text-slate-950 transition-colors hover:bg-muted/60 dark:text-foreground"
              >
                <Users className="h-[18px] w-[18px]" strokeWidth={1.55} />
                <Plus className="absolute right-0 top-0 h-2.5 w-2.5" strokeWidth={2} />
              </button>
            </div>
          )}
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        className="-mr-5 min-h-0 flex-1 overflow-y-auto overflow-x-hidden beautiful-scrollbar mobile-hide-scrollbar pb-4 pr-2 pt-2"
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
