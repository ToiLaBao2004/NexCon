import { useState, useEffect, useRef, useCallback } from "react";
import { useChatStore } from "@/stores/useChatStore";
import { useDebounce } from "@/hooks/useDebounce";
import { X, Search, ChevronDown, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import UserAvatar from "./UserAvatar";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface MessageSearchSidebarProps {
  onClose: () => void;
}

const PAGE_SIZE = 10;

// Helpers
const highlightKeyword = (text: string, keyword: string) => {
  if (!keyword || !text) return <>{text}</>;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);
  let idx = 0;
  return (
    <>
      {parts.map((part) => {
        const key = idx++;
        return new RegExp(`^${escaped}$`, 'gi').test(part)
          ? <span key={key} style={{ color: '#0068ff', fontWeight: 600 }}>{part}</span>
          : <span key={key}>{part}</span>;
      })}
    </>
  );
};

const formatRelativeDate = (dateStr: string): string => {
  const d = new Date(dateStr);
  const now = new Date();
  if (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  ) {
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  }
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 3600 * 24));
  if (diffDays === 1) return 'Hôm qua';
  if (diffDays < 7) return `${diffDays} ngày`;
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

// ISO date string from a Date (YYYY-MM-DD)
const toISO = (d: Date) => d.toISOString().split('T')[0];

// Date range options
type DateOption = 'all' | 'today' | '7days' | '30days' | 'custom';

const DATE_OPTIONS: { value: DateOption; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'today', label: 'Hôm nay' },
  { value: '7days', label: '7 ngày qua' },
  { value: '30days', label: '30 ngày qua' },
  { value: 'custom', label: 'Tùy chỉnh' },
];

const computeDateRange = (option: DateOption, customFrom: string, customTo: string)
  : { fromDate?: string; toDate?: string } => {
  const now = new Date();
  if (option === 'today') {
    return { fromDate: toISO(now), toDate: toISO(now) };
  }
  if (option === '7days') {
    const from = new Date(now); from.setDate(now.getDate() - 6);
    return { fromDate: toISO(from), toDate: toISO(now) };
  }
  if (option === '30days') {
    const from = new Date(now); from.setDate(now.getDate() - 29);
    return { fromDate: toISO(from), toDate: toISO(now) };
  }
  if (option === 'custom') {
    return {
      fromDate: customFrom || undefined,
      toDate: customTo || undefined,
    };
  }
  return {};
};

// Small generic dropdown
function Dropdown({
  label,
  open,
  onToggle,
  onClickOutside,
  children,
}: {
  label: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  onClickOutside: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClickOutside();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClickOutside]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={onToggle}
        className={cn(
          "flex items-center gap-1 h-7 px-3 rounded-full text-xs font-normal border transition-colors",
          open
            ? "border-primary/50 bg-primary/5 text-primary"
            : "border-border/50 bg-transparent text-foreground hover:bg-muted/30"
        )}
      >
        {label}
        <ChevronDown className={cn("h-3 w-3 opacity-60 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-popover border border-border/40 rounded-xl shadow-lg py-1 min-w-[180px]">
          {children}
        </div>
      )}
    </div>
  );
}

// Main component
export default function MessageSearchSidebar({ onClose }: MessageSearchSidebarProps) {
  const isMobile = useIsMobile();
  const { searchMessages, searchResults, clearSearch, activeConversationId, conversations } = useChatStore();

  // Find current conversation participants
  const conversation = conversations.find((c) => c._id === activeConversationId);
  const participants = conversation?.participants ?? [];

  // Filter state 
  const [keyword, setKeyword] = useState("");
  const [selectedSenderId, setSelectedSenderId] = useState<string>(""); // "" = all
  const [dateOption, setDateOption] = useState<DateOption>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // Dropdown open state
  const [senderOpen, setSenderOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);

  // Debounce all filter values together (stringify them)
  const debouncedKeyword = useDebounce(keyword, 300);
  const debouncedSender = useDebounce(selectedSenderId, 300);
  const debouncedDateOption = useDebounce(dateOption, 300);
  const debouncedCustomFrom = useDebounce(customFrom, 300);
  const debouncedCustomTo = useDebounce(customTo, 300);

  // Infinite scroll
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { items, isSearching } = searchResults;
  const visibleItems = items.slice(0, displayCount);
  const hasMore = items.length > displayCount;

  // Auto-focus
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Trigger search when any filter changes
  useEffect(() => {
    if (!debouncedKeyword.trim()) {
      clearSearch();
      setDisplayCount(PAGE_SIZE);
      return;
    }
    const { fromDate, toDate } = computeDateRange(debouncedDateOption, debouncedCustomFrom, debouncedCustomTo);
    // Only include date filters if custom option has values or it's not all
    const filters = {
      senderId: debouncedSender || undefined,
      fromDate,
      toDate,
    };
    searchMessages(debouncedKeyword, filters);
    setDisplayCount(PAGE_SIZE);
  }, [debouncedKeyword, debouncedSender, debouncedDateOption, debouncedCustomFrom, debouncedCustomTo]);

  // ── Infinite scroll ──
  const loadMore = useCallback(() => {
    if (!hasMore || isLoadingMore) return;
    setIsLoadingMore(true);
    setTimeout(() => {
      setDisplayCount((prev) => prev + PAGE_SIZE);
      setIsLoadingMore(false);
    }, 250);
  }, [hasMore, isLoadingMore]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) loadMore();
      },
      { root: scrollRef.current, threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, loadMore]);

  const handleClear = () => {
    setKeyword("");
    clearSearch();
    setDisplayCount(PAGE_SIZE);
  };

  const handleJumpToMessage = (messageId: string) => {
    const el = document.getElementById(`message-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('animate-highlight-flash');
      setTimeout(() => el.classList.remove('animate-highlight-flash'), 2000);
    }
  };

  // Derived label for sender dropdown
  const senderLabel = selectedSenderId
    ? (participants.find(p => p.userId._id === selectedSenderId)?.userId.displayName ?? 'Người gửi')
    : 'Người gửi';

  // Derived label for date dropdown
  const dateLabelMap: Record<DateOption, string> = {
    all: 'Ngày gửi', today: 'Hôm nay',
    '7days': '7 ngày qua', '30days': '30 ngày qua', custom: 'Tùy chỉnh',
  };
  const dateLabel = dateLabelMap[dateOption];

  return (
    <>
      {/* Mobile: dim backdrop */}
      {isMobile && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] animate-in fade-in duration-200"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          "flex flex-col bg-background border-l border-border/40 overflow-hidden",
          isMobile
            // Mobile: fixed right-side panel full height, sits above backdrop
            ? "fixed right-0 top-0 bottom-0 z-50 w-[min(330px,100vw)] shadow-2xl animate-in slide-in-from-right duration-300"
            // Desktop: flex sibling, fixed width
            : "h-full w-[330px] min-w-[330px]"
        )}
      >
      {/* Header */}
      <div className="flex h-16 shrink-0 items-center justify-between px-4 border-b border-border/40 bg-card">
        <h3 className="font-semibold text-[15px] text-foreground">Tìm kiếm trong trò chuyện</h3>
        <Button variant="ghost" size="icon" onClick={onClose}
          className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" strokeWidth={1.5} />
        </Button>
      </div>

      {/* Fixed Top Section: Search Input + Filters */}
      <div className="shrink-0 px-4 pt-4 pb-3 space-y-2.5 bg-background">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Tìm kiếm"
            className="pl-9 pr-12 h-9 bg-muted/30 border-none focus-visible:ring-1 focus-visible:ring-primary/40 rounded-full text-sm"
          />
          {keyword && (
            <button onClick={handleClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
              Xóa
            </button>
          )}
        </div>

        {/* Filters row */}
        <div className="flex gap-2 flex-wrap">
          {/* Sender dropdown */}
          <Dropdown
            label={<><span className="opacity-60 text-[10px] mr-0.5">👤</span>{senderLabel}</>}
            open={senderOpen}
            onToggle={() => { setSenderOpen(o => !o); setDateOpen(false); }}
            onClickOutside={() => setSenderOpen(false)}
          >
            {/* All option */}
            <button
              onClick={() => { setSelectedSenderId(""); setSenderOpen(false); }}
              className="flex items-center gap-2.5 w-full px-3 py-2 hover:bg-muted/40 text-sm transition-colors"
            >
              <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0 text-muted-foreground text-xs">
                Tất cả
              </div>
              <span className="flex-1 text-left truncate">Tất cả</span>
              {!selectedSenderId && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
            </button>
            {participants.map((p) => {
              const u = p.userId;
              const isSelected = selectedSenderId === u._id;
              return (
                <button
                  key={u._id}
                  onClick={() => { setSelectedSenderId(isSelected ? "" : u._id); setSenderOpen(false); }}
                  className="flex items-center gap-2.5 w-full px-3 py-2 hover:bg-muted/40 transition-colors"
                >
                  <UserAvatar type="profile" name={u.displayName} avatarUrl={u.avatarUrl ?? undefined}
                    className="!h-7 !w-7 !text-xs shrink-0" />
                  <span className="flex-1 text-sm text-left truncate">{u.displayName}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                </button>
              );
            })}
          </Dropdown>

          {/* Date dropdown */}
          <Dropdown
            label={<><span className="opacity-60 text-[10px] mr-0.5">📅</span>{dateLabel}</>}
            open={dateOpen}
            onToggle={() => { setDateOpen(o => !o); setSenderOpen(false); }}
            onClickOutside={() => setDateOpen(false)}
          >
            {DATE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  setDateOption(opt.value);
                  if (opt.value !== 'custom') setDateOpen(false);
                }}
                className="flex items-center gap-2 w-full px-3 py-2 hover:bg-muted/40 text-sm transition-colors"
              >
                <span className="flex-1 text-left">{opt.label}</span>
                {dateOption === opt.value && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
              </button>
            ))}
            {/* Custom date range pickers */}
            {dateOption === 'custom' && (
              <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border/30 mt-1">
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">Từ ngày</label>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="w-full h-8 px-2 rounded-lg border border-border/50 bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">Đến ngày</label>
                  <input
                    type="date"
                    value={customTo}
                    min={customFrom}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="w-full h-8 px-2 rounded-lg border border-border/50 bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                </div>
                <Button size="sm" className="w-full h-7 text-xs" onClick={() => setDateOpen(false)}>
                  Áp dụng
                </Button>
              </div>
            )}
          </Dropdown>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto beautiful-scrollbar">
        {/* Section header */}
        <div className="px-4 pb-1.5 border-t border-border/20 pt-3">
          <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Tin nhắn
            {items.length > 0 && !isSearching && (
              <span className="ml-1.5 font-normal normal-case tabular-nums">({items.length})</span>
            )}
          </h4>
        </div>

        {/* Results */}
        {isSearching ? (
          <div className="flex flex-col items-center justify-center py-14 gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Đang tìm kiếm...</span>
          </div>
        ) : visibleItems.length > 0 ? (
          <div>
            {visibleItems.map((msg) => {
              const sender = typeof msg.senderId === 'object' && msg.senderId !== null
                ? (msg.senderId as any) : null;
              const senderName: string = sender?.displayName ?? 'Người dùng';
              const senderAvatar: string | undefined = sender?.avatarUrl ?? undefined;
              const contentText: string = msg.content ?? (msg as any).fileName ?? '';

              return (
                <button
                  key={msg._id}
                  onClick={() => handleJumpToMessage(msg._id)}
                  className="w-full text-left px-4 py-2.5 hover:bg-muted/30 transition-colors flex gap-2.5"
                >
                  <div className="shrink-0 mt-0.5">
                    <UserAvatar type="profile" name={senderName} avatarUrl={senderAvatar}
                      className="!h-8 !w-8 !text-xs" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="text-[13px] font-semibold text-foreground truncate leading-tight">
                        {senderName}
                      </span>
                      <span className="text-[11px] text-muted-foreground shrink-0 whitespace-nowrap">
                        {formatRelativeDate(msg.createdAt)}
                      </span>
                    </div>
                    <p className="text-[12.5px] text-muted-foreground/80 line-clamp-2 leading-snug">
                      {msg.type === 'link' && (
                        <span className="text-muted-foreground/50 mr-1 text-[11px]">[Link]</span>
                      )}
                      {highlightKeyword(contentText, debouncedKeyword)}
                    </p>
                  </div>
                </button>
              );
            })}

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="h-4 flex items-center justify-center">
              {isLoadingMore && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
          </div>
        ) : debouncedKeyword.trim() ? (
          <div className="px-6 py-14 text-center">
            <p className="text-[14px] font-medium text-foreground mb-1">Không tìm thấy tin nhắn nào</p>
            <p className="text-[12px] text-muted-foreground">Hãy thử từ khóa khác.</p>
          </div>
        ) : (
          <div className="px-6 py-14 text-center text-[13px] text-muted-foreground">
            Nhập từ khóa để tìm kiếm tin nhắn
          </div>
        )}
      </div>
      </aside>
    </>
  );
}
