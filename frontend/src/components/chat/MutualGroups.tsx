import { useMemo, useState } from "react";
import { Dialog, DialogPortal, DialogOverlay, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Popover, PopoverTrigger, PopoverContent, PopoverHeader, PopoverTitle, PopoverDescription } from "@/components/ui/popover";
import { useChatStore } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";
import GroupChatAvatar from "./GroupChatAvatar";
import { ChevronLeft, Users } from "lucide-react";
import type { Conversation } from "@/types/chat";

function useComputedMutualGroups(otherParticipantId?: string | null) {
  const { conversations } = useChatStore();
  const { user } = useAuthStore();
  return useMemo(() => {
    if (!user || !otherParticipantId) return [] as Conversation[];
    return conversations.filter(
      (c) =>
        c.type === "group" &&
        c.participants?.some((p) => p.userId?._id === user._id) &&
        c.participants?.some((p) => p.userId?._id === otherParticipantId),
    );
  }, [conversations, user, otherParticipantId]);
}

interface GroupItemProps {
  group: Conversation;
  onClick: () => void;
}

function GroupItem({ group, onClick }: GroupItemProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full px-3 py-2 rounded hover:bg-muted/10 text-left"
    >
      <div className="shrink-0 cursor-pointer">
        <GroupChatAvatar participants={group.participants} type="sidebar" groupAvatarUrl={group.group?.avatarUrl} />
      </div>
      <div className="min-w-0 flex-1 cursor-pointer">
        <div className="font-medium text-sm text-foreground truncate">
          {group.group?.name || "Nhóm"}
        </div>
        <div className="text-xs text-muted-foreground">
          {group.participants?.length ?? 0} thành viên
        </div>
      </div>
    </button>
  );
}

// ── MutualGroupsPanel ────────────────────────────────────────────────────────
// Full slide-in panel (used inside ConversationInfoSidebar)

interface PanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  otherParticipantId?: string | null;
}

export function MutualGroupsPanel({ open, onOpenChange, otherParticipantId }: PanelProps) {
  const mutualGroups = useComputedMutualGroups(otherParticipantId);
  const { setActiveConversation, fetchMessages } = useChatStore();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-transparent" />
        <DialogPrimitive.Content className="fixed inset-y-0 right-0 w-screen md:w-[350px] p-0 m-0 rounded-none shadow-2xl bg-card border-l border-border/40 z-[201] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-right-full duration-300">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40 bg-card">
            <button
              onClick={() => onOpenChange(false)}
              className="p-1 rounded hover:bg-muted/10"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <DialogHeader className="p-0">
              <DialogTitle className="text-base font-medium">Nhóm chung</DialogTitle>
            </DialogHeader>
          </div>

          <div className="p-3 overflow-auto h-full bg-card">
            {mutualGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground px-2 py-2">Không có nhóm chung</p>
            ) : (
              <div className="flex flex-col gap-1">
                {mutualGroups.map((g) => (
                  <GroupItem
                    key={g._id}
                    group={g}
                    onClick={async () => {
                      onOpenChange(false);
                      setActiveConversation(g._id);
                      try { await fetchMessages(g._id); } catch { }
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

// ── MutualGroupsPopover ──────────────────────────────────────────────────────
// Inline popover trigger (used inside ConversationLists)

interface PopoverProps {
  mutualGroups: Conversation[];
  mutualGroupCount: number;
  onSelectConversation: (id: string) => Promise<void> | void;
}

export function MutualGroupsPopover({
  mutualGroups,
  mutualGroupCount,
  onSelectConversation,
}: PopoverProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="flex w-full items-center gap-3 px-4 py-3 text-foreground hover:bg-muted/10 transition-colors bg-card font-normal cursor-pointer">
          <Users className="h-5 w-5 text-muted-foreground/70 shrink-0" strokeWidth={1.5} />
          <span className="text-[15px]">{`${mutualGroupCount} nhóm chung`}</span>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-64 bg-card border border-border/40 rounded-md shadow-soft p-2">
        <PopoverHeader>
          <PopoverTitle>Nhóm chung</PopoverTitle>
          <PopoverDescription>{mutualGroups.length} nhóm</PopoverDescription>
        </PopoverHeader>
        <div className="mt-2 flex flex-col gap-1 max-h-60 overflow-auto">
          {mutualGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground/90 px-2 py-1">Không có nhóm chung</p>
          ) : (
            mutualGroups.map((g) => (
              <GroupItem
                key={g._id}
                group={g}
                onClick={async () => {
                  setOpen(false);
                  try { await onSelectConversation(g._id); } catch { }
                }}
              />
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
