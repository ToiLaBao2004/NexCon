import { Clock } from "lucide-react";
import { SidebarMediaLinks } from "./SidebarMediaLinks";
import type { Conversation } from "@/types/chat";
import { MutualGroupsPopover } from "./MutualGroups";
import MembersPanel from "./MembersPanel";
import { useChatStore } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { useState } from "react";
import { ConversationRemindersPanel } from "./ConversationRemindersPanel";

// Local replacements for previously-shared sidebar helpers
function ThickDividerLocal() {
  return <div className="h-2 w-full shrink-0 bg-muted/40 pointer-events-none" />;
}

function ListRowLocal({ icon: Icon, label, onClick }: { icon: React.ElementType; label: string; onClick?: () => void; }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 bg-card px-5 py-3.5 text-foreground transition-colors hover:bg-muted/60"
    >
      <Icon className="h-5 w-5 shrink-0 text-foreground" strokeWidth={1.65} />
      <span className="text-[15px] font-normal">{label}</span>
    </button>
  );
}

interface Props {
  conversation: Conversation;
  mutualGroupCount: number;
  memberCount?: number;
}

export default function ConversationLists({ conversation, mutualGroupCount, memberCount }: Props) {
  const isGroup = conversation.type === "group";
  const { conversations, messages, setActiveConversation, fetchMessages } = useChatStore();
  const { user } = useAuthStore();
  const [remindersOpen, setRemindersOpen] = useState(false);

  const mutualGroups = (() => {
    if (!user) return [] as any[];
    if (conversation.type !== "direct") return [] as any[];
    const other = conversation.participants.find((p: any) => p.userId?._id?.toString() !== user._id?.toString());
    const otherId = other?.userId?._id;
    if (!otherId) return [] as any[];
    return conversations.filter((c: any) =>
      c.type === "group" &&
      c.participants?.some((p: any) => p.userId?._id === user._id) &&
      c.participants?.some((p: any) => p.userId?._id === otherId)
    );
  })();

  const conversationName = isGroup
    ? (conversation.group?.name || "Nhóm")
    : undefined;

  return (
    <>
      <ThickDividerLocal />
      <ListRowLocal
        icon={Clock}
        label="Danh sách nhắc hẹn"
        onClick={() => setRemindersOpen(true)}
      />
      {isGroup ? (
        <MembersPanel
          conversationId={conversation._id}
          isApprovalRequired={conversation.group?.isApprovalRequired}
          participants={conversation.participants}
          memberCount={memberCount}
          currentUserId={user?._id}
          isGroupAdmin={conversation.group?.admins?.some(adminId => adminId.toString() === user?._id?.toString())}
          adminIds={conversation.group?.admins || []}
        />
      ) : (
        <MutualGroupsPopover
          mutualGroups={mutualGroups}
          mutualGroupCount={mutualGroupCount}
          onSelectConversation={async (id: string) => {
            setActiveConversation(id);
            if (!messages[id]) {
              try {
                await fetchMessages(id);
              } catch { }
            }
          }}
        />
      )}
      <ThickDividerLocal />

      {/* Media, Files, Links */}
      <SidebarMediaLinks conversation={conversation} />

      {/* Shared reminders panel */}
      <ConversationRemindersPanel
        open={remindersOpen}
        onOpenChange={setRemindersOpen}
        conversationId={conversation._id}
        conversationName={conversationName}
      />
    </>
  );
}
