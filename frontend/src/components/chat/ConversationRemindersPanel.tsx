import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  ChevronLeft,
  Bell,
  Calendar,
  Check,
  Clock3,
  Copy,
  Loader2,
  UserMinus,
  UserPlus,
  Video,
  X,
} from "lucide-react";
import { reminderService } from "@/services/reminderService";
import type { Reminder } from "@/types/reminder";
import { useAuthStore } from "@/stores/useAuthStore";
import { useChatStore } from "@/stores/useChatStore";
import {
  getReminderContent,
  formatClock,
  toDateKey,
  formatDayLabel,
} from "@/pages/reminder/utils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Link } from "react-router";
import UserAvatar from "@/components/chat/UserAvatar";

//  Types 

type ParticipationFilter = "joined" | "declined";

//  Status config 

const STATUS_CONFIG: Record<
  Reminder["status"],
  { bar: string; dot: string; label: string; labelClass: string }
> = {
  pending: {
    bar: "bg-emerald-500",
    dot: "bg-emerald-500",
    label: "Sắp đến",
    labelClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  snoozed: {
    bar: "bg-amber-400",
    dot: "bg-amber-400",
    label: "Hoãn lại",
    labelClass: "bg-amber-400/15 text-amber-600 dark:text-amber-400",
  },
  triggered: {
    bar: "bg-sky-400/60",
    dot: "bg-sky-400/60",
    label: "Đã nhắc",
    labelClass: "bg-sky-400/10 text-sky-600 dark:text-sky-400",
  },
  dismissed: {
    bar: "bg-muted-foreground/30",
    dot: "bg-muted-foreground/30",
    label: "Đã bỏ qua",
    labelClass: "bg-muted text-muted-foreground",
  },
};

//  Participation badge  

function ParticipationBadge({ status }: { status?: Reminder["participationStatus"] }) {
  if (!status) return null;
  const isJoined = status === "joined";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-medium",
        isJoined
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "bg-rose-500/10 text-rose-500"
      )}
    >
      {isJoined ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
      {isJoined ? "Đã tham gia" : "Không tham gia"}
    </span>
  );
}

//  Single reminder row 

interface ReminderRowProps {
  reminder: Reminder;
  onClick: () => void;
}

function ReminderRow({ reminder, onClick }: ReminderRowProps) {
  const currentUser = useAuthStore((state) => state.user);
  const currentUserId = currentUser?._id;
  const conversation = useChatStore((state) =>
    state.conversations.find((c) => c._id === reminder.conversationId)
  );

  let creatorNameDisplay = "Bạn";
  let creatorAvatarUrl: string | null | undefined = undefined;

  if (reminder.createdBy && reminder.createdBy !== currentUserId?.toString()) {
    if (conversation) {
      const creatorParticipant = conversation.participants.find(
        (p: any) => p.userId?._id?.toString() === reminder.createdBy?.toString()
      );
      if (creatorParticipant) {
        creatorNameDisplay = creatorParticipant.userId?.nickname?.trim()
          ? creatorParticipant.userId.nickname
          : creatorParticipant.userId?.displayName || "Thành viên";
        creatorAvatarUrl = creatorParticipant.userId?.avatarUrl;
      } else {
        creatorNameDisplay = "Thành viên";
      }
    } else {
      creatorNameDisplay = "Thành viên";
    }
  } else if (reminder.createdBy) {
    creatorNameDisplay = "Bạn";
    creatorAvatarUrl = currentUser?.avatarUrl;
  }

  const content = getReminderContent(reminder);
  const date = new Date(reminder.remindAt);
  const cfg = STATUS_CONFIG[reminder.status];

  const calendarDay = new Intl.DateTimeFormat("vi-VN", { day: "2-digit" }).format(date);
  const calendarMonth = new Intl.DateTimeFormat("vi-VN", { month: "numeric" }).format(date);
  const calendarWeekday = new Intl.DateTimeFormat("vi-VN", { weekday: "short" }).format(date);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group w-full text-left flex items-stretch gap-0 rounded-xl border bg-card overflow-hidden",
        "shadow-sm hover:shadow-md transition-all duration-150 active:scale-[0.99]",
        "border-border/60 hover:border-border"
      )}
    >
      {/* Left status bar */}
      <div className={cn("w-[3px] shrink-0", cfg.bar)} />

      {/* Calendar block */}
      <div className="w-[58px] shrink-0 flex flex-col items-center justify-center border-r border-border/50 bg-muted/25 py-2.5 px-1 gap-0.5">
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/80 leading-none">
          {calendarWeekday}
        </span>
        <span className="text-[22px] font-extrabold leading-none text-foreground">
          {calendarDay}
        </span>
        <span className="text-[10px] font-semibold text-rose-500 leading-none">
          Th.{calendarMonth}
        </span>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 flex flex-col justify-center px-3 py-2.5 gap-1.5">
        <p className="text-[13px] font-semibold text-foreground leading-snug line-clamp-2 break-words">
          {content}
        </p>

        {/* Meeting Link Box (compact) */}
        {reminder.meetingRoomName && (
          <div
            className="flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-2 py-1"
            onClick={(e) => e.stopPropagation()}
          >
            <Video className="h-3 w-3 shrink-0 text-primary" />
            <Link
              to={`/meet?code=${reminder.meetingRoomName}`}
              className="flex-1 truncate text-[11px] font-medium text-primary underline-offset-2 hover:underline transition-colors"
            >
              {`${window.location.origin}/meet?code=${reminder.meetingRoomName}`}
            </Link>
            <button
              type="button"
              className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
              title="Sao chép link"
              onClick={() => {
                const url = `${window.location.origin}/meet?code=${reminder.meetingRoomName}`;
                navigator.clipboard.writeText(url);
                toast.success('Đã sao chép link cuộc họp');
              }}
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock3 className="h-3 w-3 shrink-0" />
            {formatClock(reminder.remindAt)}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-medium",
              cfg.labelClass
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
            {cfg.label}
          </span>
          <ParticipationBadge status={reminder.participationStatus} />
          {reminder.createdBy && (
            <span className="inline-flex items-center gap-1 rounded-full pr-1.5 pl-0.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground border border-border/40">
              <UserAvatar
                type="seen"
                name={creatorNameDisplay}
                avatarUrl={creatorAvatarUrl ?? undefined}
                className="h-3.5 w-3.5"
              />
              Tạo bởi: {creatorNameDisplay}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

//  Detail dialog 

interface DetailDialogProps {
  reminder: Reminder | null;
  onClose: () => void;
  onUpdate: (updated: Reminder) => void;
  currentUserId?: string;
  onCancelSharedForAll: (sharedKey: string) => void;
}

function DetailDialog({ reminder, onClose, onUpdate, currentUserId, onCancelSharedForAll }: DetailDialogProps) {
  const [isActing, setIsActing] = useState(false);
  const currentUser = useAuthStore((state) => state.user);
  const conversation = useChatStore((state) =>
    state.conversations.find((c) => c._id === reminder?.conversationId)
  );

  if (!reminder) return null;

  const content   = getReminderContent(reminder);
  const date      = new Date(reminder.remindAt);
  const cfg       = STATUS_CONFIG[reminder.status];
  const isJoined  = reminder.participationStatus === "joined";
  const isDeclined = reminder.participationStatus === "declined";
  const sharedKey = reminder.sharedKey;
  const isCreator = String(reminder.createdBy || "") === String(currentUserId || "");

  let creatorNameDisplay = "Bạn";
  let creatorAvatarUrl: string | null | undefined = undefined;

  if (reminder.createdBy && reminder.createdBy !== currentUserId?.toString()) {
    if (conversation) {
      const creatorParticipant = conversation.participants.find(
        (p: any) => p.userId?._id?.toString() === reminder.createdBy?.toString()
      );
      if (creatorParticipant) {
        creatorNameDisplay = creatorParticipant.userId?.nickname?.trim()
          ? creatorParticipant.userId.nickname
          : creatorParticipant.userId?.displayName || "Thành viên";
        creatorAvatarUrl = creatorParticipant.userId?.avatarUrl;
      } else {
        creatorNameDisplay = "Thành viên";
      }
    } else {
      creatorNameDisplay = "Thành viên";
    }
  } else if (reminder.createdBy) {
    creatorNameDisplay = "Bạn";
    creatorAvatarUrl = currentUser?.avatarUrl;
  }

  const handleParticipation = async (participate: boolean) => {
    if (!sharedKey) {
      toast.error("Thiếu thông tin nhắc hẹn chung");
      return;
    }
    if (isActing) return;

    setIsActing(true);
    try {
      const { reminder: updated } = await reminderService.updateSharedReminderParticipation(
        sharedKey,
        participate
      );
      onUpdate(updated);
      toast.success(participate ? "Đã tham gia nhắc hẹn" : "Đã từ chối không tham gia");
    } catch {
      toast.error("Không thể cập nhật, thử lại sau");
    } finally {
      setIsActing(false);
    }
  };

  const handleCancelForAll = async () => {
    if (!sharedKey) {
      toast.error("Thiếu thông tin nhắc hẹn chung");
      return;
    }
    if (isActing) return;

    setIsActing(true);
    try {
      await reminderService.deleteReminder(reminder._id);
      onCancelSharedForAll(sharedKey);
      toast.success("Đã hủy nhắc hẹn chung cho tất cả thành viên");
      onClose();
    } catch {
      toast.error("Không thể hủy nhắc hẹn lúc này");
    } finally {
      setIsActing(false);
    }
  };

  const fullDate = new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);

  return (
    <Dialog open={!!reminder} onOpenChange={(open) => !open && onClose()}>
      <DialogPortal>
        {/* Backdrop */}
        <DialogOverlay className="z-[60] bg-black/40" />

        {/* Dialog Content Wrapper */}
        <DialogPrimitive.Content
          onPointerDownOutside={onClose}
          onEscapeKeyDown={onClose}
          className="fixed z-[61] inset-0 flex items-end sm:items-center justify-center pointer-events-none px-4 pb-6 sm:pb-0 outline-none"
        >
          <div
            className="pointer-events-auto w-full max-w-sm rounded-2xl border border-border/60 bg-card shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header bar */}
            <div className={cn("h-1 w-full", cfg.bar)} />

            <div className="p-5 flex flex-col gap-4">
              {/* Close button + title row */}
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-[15px] font-bold text-foreground leading-snug flex-1 min-w-0">
                  {content}
                </h3>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1 rounded-full hover:bg-muted/60 text-muted-foreground transition-colors shrink-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Meeting Link Box */}
              {reminder.meetingRoomName && (
                <div
                  className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Video className="h-4 w-4 shrink-0 text-primary" />
                  <Link
                    to={`/meet?code=${reminder.meetingRoomName}`}
                    className="flex-1 truncate text-[13px] font-medium text-primary underline-offset-2 hover:underline transition-colors"
                  >
                    {`${window.location.origin}/meet?code=${reminder.meetingRoomName}`}
                  </Link>
                  <button
                    type="button"
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                    title="Sao chép link cuộc họp"
                    onClick={() => {
                      const url = `${window.location.origin}/meet?code=${reminder.meetingRoomName}`;
                      navigator.clipboard.writeText(url);
                      toast.success('Đã sao chép link cuộc họp');
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Info rows */}
              <div className="flex flex-col gap-2 rounded-xl bg-muted/30 px-4 py-3 border border-border/40">
                {/* Date */}
                <div className="flex items-center gap-2.5 text-[13px] text-foreground">
                  <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="capitalize">{fullDate}</span>
                </div>
                {/* Time */}
                <div className="flex items-center gap-2.5 text-[13px] text-foreground">
                  <Clock3 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{formatClock(reminder.remindAt)}</span>
                  {/* Status */}
                  <span
                    className={cn(
                      "ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                      cfg.labelClass
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
                    {cfg.label}
                  </span>
                </div>
                {/* Creator */}
                {reminder.createdBy && (
                  <div className="flex items-center gap-2.5 text-[13px] text-foreground mt-1 pt-2 border-t border-border/40">
                    <span className="text-muted-foreground text-[12px]">Người tạo:</span>
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <UserAvatar
                        type="seen"
                        name={creatorNameDisplay}
                        avatarUrl={creatorAvatarUrl ?? undefined}
                        className="h-4 w-4"
                      />
                      {creatorNameDisplay}
                    </span>
                  </div>
                )}
              </div>

              {/* Participation status */}
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-muted-foreground">Trạng thái của bạn:</span>
                <ParticipationBadge status={reminder.participationStatus} />
                {!reminder.participationStatus && (
                  <span className="text-[12px] text-muted-foreground italic">Chưa phản hồi</span>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2.5 pt-1">
                {isCreator ? (
                  <>
                    {(!isJoined || isDeclined) && (
                      <button
                        type="button"
                        onClick={() => handleParticipation(true)}
                        disabled={isActing}
                        className={cn(
                          "flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-semibold transition-all",
                          "bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm active:scale-[0.98]",
                          "disabled:opacity-60 disabled:cursor-not-allowed"
                        )}
                      >
                        {isActing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <UserPlus className="h-4 w-4" />
                        )}
                        {isDeclined ? "Tham gia lại" : "Tham gia"}
                      </button>
                    )}

                    {isJoined && !isDeclined && (
                      <span className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <Check className="h-4 w-4" />
                        Đang tham gia
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={handleCancelForAll}
                      disabled={isActing}
                      className={cn(
                        "flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-semibold transition-all",
                        "border border-rose-500/60 text-rose-500 hover:bg-rose-500/8 active:scale-[0.98]",
                        "disabled:opacity-60 disabled:cursor-not-allowed"
                      )}
                    >
                      {isActing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <X className="h-4 w-4" />
                      )}
                      Hủy cho tất cả
                    </button>
                  </>
                ) : (
                  <>
                    {(!isJoined || isDeclined) && (
                      <button
                        type="button"
                        onClick={() => handleParticipation(true)}
                        disabled={isActing}
                        className={cn(
                          "flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-semibold transition-all",
                          "bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm active:scale-[0.98]",
                          "disabled:opacity-60 disabled:cursor-not-allowed"
                        )}
                      >
                        {isActing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <UserPlus className="h-4 w-4" />
                        )}
                        {isDeclined ? "Tham gia lại" : "Tham gia"}
                      </button>
                    )}

                    {!isDeclined && (
                      <button
                        type="button"
                        onClick={() => handleParticipation(false)}
                        disabled={isActing}
                        className={cn(
                          "flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-semibold transition-all",
                          "border border-rose-500/60 text-rose-500 hover:bg-rose-500/8 active:scale-[0.98]",
                          "disabled:opacity-60 disabled:cursor-not-allowed"
                        )}
                      >
                        {isActing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <UserMinus className="h-4 w-4" />
                        )}
                        Không tham gia
                      </button>
                    )}

                    {isJoined && !isDeclined && (
                      <span className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <Check className="h-4 w-4" />
                        Đang tham gia
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

//  Date group header 

function DateGroupHeader({ dateKey }: { dateKey: string }) {
  return (
    <div className="flex items-center gap-2 px-1 pt-3 pb-1 first:pt-1">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 whitespace-nowrap">
        {formatDayLabel(dateKey)}
      </span>
      <div className="flex-1 h-px bg-border/50" />
    </div>
  );
}

//  Filter tabs 

interface FilterTabsProps {
  value: ParticipationFilter;
  onChange: (v: ParticipationFilter) => void;
  counts: Record<ParticipationFilter, number>;
}

function FilterTabs({ value, onChange, counts }: FilterTabsProps) {
  const tabs: { key: ParticipationFilter; label: string }[] = [
    { key: "joined",   label: "Đã tham gia" },
    { key: "declined", label: "Không tham gia" },
  ];

  return (
    <div className="px-3 py-2.5 border-b border-border/40 bg-card shrink-0">
      <div className="inline-flex w-full items-center rounded-lg bg-muted p-1">
        {tabs.map((tab) => {
          const active = value === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              className={[
                "flex-1 h-8 rounded-md px-3 text-sm transition-colors inline-flex items-center justify-center gap-1.5",
                active
                  ? "bg-background text-foreground shadow-sm font-normal"
                  : "text-muted-foreground hover:text-foreground hover:bg-transparent",
              ].join(" ")}
            >
              {tab.label}
              <span
                className={[
                  "rounded-full px-1.5 py-px text-[10px] font-bold leading-none",
                  active
                    ? "bg-muted text-muted-foreground"
                    : "bg-background/60 text-muted-foreground",
                ].join(" ")}
              >
                {counts[tab.key]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

//  Skeleton 

function SkeletonRow() {
  return (
    <div className="flex items-stretch gap-0 rounded-xl border border-border/50 bg-card overflow-hidden animate-pulse">
      <div className="w-1 bg-muted/60 rounded-l-xl" />
      <div className="w-[62px] bg-muted/30 border-r border-border/40 flex flex-col items-center py-3 px-1 gap-1.5">
        <div className="h-2 w-5 rounded bg-muted" />
        <div className="h-6 w-6 rounded bg-muted" />
        <div className="h-2 w-6 rounded bg-muted" />
      </div>
      <div className="flex-1 px-3 py-3 space-y-2">
        <div className="h-3.5 w-5/6 rounded bg-muted" />
        <div className="h-2.5 w-2/5 rounded bg-muted" />
      </div>
    </div>
  );
}

//  Empty state 

function EmptyState({ filter }: { filter: ParticipationFilter }) {
  const messages: Record<ParticipationFilter, { title: string; desc: string }> = {
    joined:   { title: "Chưa tham gia nhắc hẹn nào", desc: "Các nhắc hẹn bạn đã tham gia sẽ hiển thị tại đây." },
    declined: { title: "Không có nhắc hẹn bị từ chối", desc: "Các nhắc hẹn bạn đã từ chối sẽ hiển thị tại đây." },
  };
  const { title, desc } = messages[filter];

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted/50 ring-4 ring-muted/20">
        <Bell className="h-7 w-7 text-muted-foreground/50" strokeWidth={1.4} />
      </div>
      <div className="space-y-1.5">
        <p className="text-[14px] font-semibold text-foreground">{title}</p>
        <p className="text-[12px] text-muted-foreground leading-relaxed max-w-[220px]">{desc}</p>
      </div>
    </div>
  );
}

//  Group reminders by date 

function groupByDate(reminders: Reminder[]) {
  const groups = new Map<string, Reminder[]>();
  for (const r of reminders) {
    const key = toDateKey(new Date(r.remindAt));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  return Array.from(groups.entries()).map(([key, items]) => ({ key, items }));
}

//  Main Panel 

interface ConversationRemindersPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  conversationName?: string;
}

export function ConversationRemindersPanel({
  open,
  onOpenChange,
  conversationId,
  conversationName,
}: ConversationRemindersPanelProps) {
  const currentUserId = useAuthStore((state) => state.user?._id);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [filter, setFilter] = useState<ParticipationFilter>("joined");
  const [selectedReminder, setSelectedReminder] = useState<Reminder | null>(null);

  // Refs — sentinel must always be in DOM for IntersectionObserver
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Keep stable refs to avoid stale closures inside IntersectionObserver
  const hasMoreRef = useRef(hasMore);
  const nextCursorRef = useRef(nextCursor);
  const isLoadingMoreRef = useRef(isLoadingMore);
  hasMoreRef.current = hasMore;
  nextCursorRef.current = nextCursor;
  isLoadingMoreRef.current = isLoadingMore;

  //  Fetch 

  const fetchInitial = useCallback(async () => {
    if (!conversationId) return;
    setIsLoading(true);
    setReminders([]);
    setNextCursor(null);
    setHasMore(false);
    try {
      const result = await reminderService.getReminders({
        conversationId,
        status: "pending,snoozed,triggered,dismissed",
        sort: "remindAt_asc",
        limit: 10,
      });
      setReminders(result.reminders);
      setHasMore(result.hasMore);
      setNextCursor(result.nextCursor);
      setHasFetched(true);
    } catch (err) {
      console.error("[ConversationRemindersPanel] fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId]);

  const fetchMore = useCallback(async () => {
    if (isLoadingMoreRef.current || !hasMoreRef.current || !nextCursorRef.current) return;
    setIsLoadingMore(true);
    try {
      const result = await reminderService.getReminders({
        conversationId,
        status: "pending,snoozed,triggered,dismissed",
        sort: "remindAt_asc",
        limit: 10,
        cursor: nextCursorRef.current,
      });
      setReminders((prev) => {
        const seen = new Set(prev.map((r) => r._id));
        return [...prev, ...result.reminders.filter((r) => !seen.has(r._id))];
      });
      setHasMore(result.hasMore);
      setNextCursor(result.nextCursor);
    } catch (err) {
      console.error("[ConversationRemindersPanel] fetchMore error:", err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [conversationId]);

  //  Open/close side-effects 

  useEffect(() => {
    if (open) {
      setHasFetched(false);
      setFilter("joined");
      setSelectedReminder(null);
      void fetchInitial();
    }
  }, [open, fetchInitial]);

  useEffect(() => {
    if (open && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [open]);

  //  IntersectionObserver — same pattern as ReminderPage 
  // Sentinel is always rendered; observer re-attaches whenever hasMore changes.

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMoreRef.current && !isLoadingMoreRef.current) {
          void fetchMore();
        }
      },
      {
        // Use the scroll container itself as the root so that the threshold
        // fires relative to the scrollable area, not the viewport.
        root: scrollContainerRef.current,
        threshold: 0.1,
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, fetchMore]);

  //  Derived state 

  const filteredReminders = useMemo(() => {
    if (filter === "joined") return reminders.filter((r) => r.participationStatus === "joined");
    return reminders.filter((r) => r.participationStatus === "declined");
  }, [reminders, filter]);

  const filterCounts = useMemo<Record<ParticipationFilter, number>>(() => ({
    joined: reminders.filter((r) => r.participationStatus === "joined").length,
    declined: reminders.filter((r) => r.participationStatus === "declined").length,
  }), [reminders]);

  const showSkeleton = isLoading && !hasFetched;
  const showEmpty = hasFetched && !isLoading && filteredReminders.length === 0;
  const groups = groupByDate(filteredReminders);

  //  Participation update handler 

  const handleReminderUpdate = useCallback((updated: Reminder) => {
    setReminders((prev) =>
      prev.map((r) => (r._id === updated._id ? updated : r))
    );
    setSelectedReminder(updated);
  }, []);

  const handleCancelSharedForAll = useCallback((sharedKey: string) => {
    setReminders((prev) => prev.filter((item) => item.sharedKey !== sharedKey));
    setSelectedReminder(null);
  }, []);

  //  Render 

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        {/* Backdrop — click to close */}
        <DialogOverlay className="z-[51] bg-transparent" />
        <DialogPrimitive.Content
          className="fixed inset-y-0 right-0 w-screen md:w-[350px] z-[51] flex flex-col rounded-none shadow-2xl bg-card border-l border-border/40 focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-right-full duration-300"
        >
          {/*  Header  */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 bg-card shrink-0">
            <button
              onClick={() => onOpenChange(false)}
              className="p-1.5 rounded-md hover:bg-muted/60 transition-colors text-foreground"
              aria-label="Quay lại"
            >
              <ChevronLeft className="h-[18px] w-[18px]" />
            </button>
            <DialogHeader className="p-0 flex-1 min-w-0">
              <DialogTitle className="text-[15px] font-semibold text-foreground truncate leading-tight">
                Nhắc hẹn chung
              </DialogTitle>
              {conversationName && (
                <p className="text-[12px] text-muted-foreground truncate leading-tight mt-0.5">
                  {conversationName}
                </p>
              )}
            </DialogHeader>
            {/* Reminder count badge */}
            {hasFetched && reminders.length > 0 && (
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                {reminders.length}{hasMore ? "+" : ""}
              </span>
            )}
          </div>

          {/*  Filter tabs  */}
          <FilterTabs value={filter} onChange={setFilter} counts={filterCounts} />

          {/*  Scrollable body  */}
          <div
            ref={scrollContainerRef}
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain beautiful-scrollbar px-3 pb-4"
            // Ensure the div captures wheel events even when inner content
            // is shorter — avoids the "scroll doesn't work" symptom.
            style={{ scrollbarGutter: "stable" }}
          >
            {/* Skeleton */}
            {showSkeleton && (
              <div className="flex flex-col gap-2 pt-3">
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </div>
            )}

            {/* Empty */}
            {showEmpty && <EmptyState filter={filter} />}

            {/* Grouped reminder list */}
            {!showSkeleton && groups.length > 0 && (
              <div className="flex flex-col">
                {groups.map(({ key, items }) => (
                  <div key={key}>
                    <DateGroupHeader dateKey={key} />
                    <div className="flex flex-col gap-2">
                      {items.map((reminder) => (
                        <ReminderRow
                          key={reminder._id}
                          reminder={reminder}
                          onClick={() => setSelectedReminder(reminder)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Sentinel — always present so IntersectionObserver can attach */}
            <div ref={sentinelRef} className="flex justify-center py-3" aria-hidden>
              {isLoadingMore && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/60" />
              )}
            </div>
          </div>
        </DialogPrimitive.Content>

        {/* Detail popup (rendered inside the same Portal to ensure it overlays the panel) */}
        {selectedReminder && (
          <DetailDialog
            reminder={selectedReminder}
            onClose={() => setSelectedReminder(null)}
            onUpdate={handleReminderUpdate}
            currentUserId={currentUserId}
            onCancelSharedForAll={handleCancelSharedForAll}
          />
        )}
      </DialogPortal>
    </Dialog>
  );
}
