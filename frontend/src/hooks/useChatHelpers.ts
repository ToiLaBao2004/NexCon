import { useMemo } from "react";
import { useChatStore } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";
import type { Conversation } from "@/types/chat";

/**
 * Returns all group conversations that both the current user
 * and `otherParticipantId` are members of.
 */
export function useComputedMutualGroups(
  otherParticipantId?: string | null,
): Conversation[] {
  const { conversations } = useChatStore();
  const { user } = useAuthStore();

  return useMemo(() => {
    if (!user || !otherParticipantId) return [];
    return conversations.filter(
      (c) =>
        c.type === "group" &&
        c.participants?.some((p) => p.userId?._id === user._id) &&
        c.participants?.some((p) => p.userId?._id === otherParticipantId),
    );
  }, [conversations, user, otherParticipantId]);
}
