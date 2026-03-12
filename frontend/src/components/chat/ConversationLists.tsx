import { Clock } from "lucide-react";
import { SidebarMediaLinks } from "./SidebarMediaLinks";
import type { Conversation } from "@/types/chat";
import { MutualGroupsPopover } from "./MutualGroups";
import MembersPanel from "./MembersPanel";
import { useChatStore } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";

// Local replacements for previously-shared sidebar helpers
function ThickDividerLocal() {
  return <div className="h-2 w-full bg-background shrink-0 pointer-events-none" />;
}

function ListRowLocal({ icon: Icon, label, onClick }: { icon: React.ElementType; label: string; onClick?: () => void; }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3 text-foreground hover:bg-muted/10 transition-colors bg-card font-normal"
    >
      <Icon className="h-5 w-5 text-muted-foreground/70 shrink-0" strokeWidth={1.5} />
      <span className="text-[15px]">{label}</span>
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
  const { conversations, setActiveConversation, fetchMessages } = useChatStore();
  const { user } = useAuthStore();
  // popovers/panels are handled in separate components

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
  return (
    <>
      <ThickDividerLocal />
      <ListRowLocal icon={Clock} label="Danh sách nhắc hẹn" />
      {isGroup ? (
        <MembersPanel participants={conversation.participants} memberCount={memberCount} />
      ) : (
        <MutualGroupsPopover
          mutualGroups={mutualGroups}
          mutualGroupCount={mutualGroupCount}
          onSelectConversation={async (id: string) => {
            setActiveConversation(id);
            try {
              await fetchMessages(id);
            } catch {}
          }}
        />
      )}
      <ThickDividerLocal />

      {/* Media, Files, Links */}
      <SidebarMediaLinks conversation={conversation} />
    </>
  );
}
