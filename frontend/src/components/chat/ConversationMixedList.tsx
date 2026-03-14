import { useEffect } from "react";
import { useChatStore } from "@/stores/useChatStore";
import DirectMessageCard from "./DirectMessageCard";
import GroupChatCard from "./GroupChatCard";

const ConversationMixedList = () => {
  const { conversations, fetchConversations } = useChatStore();

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  if (!conversations) return null;

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-2">
      {conversations.map((convo) =>
        convo.type === "group" ? (
          <GroupChatCard convo={convo} key={convo._id} />
        ) : (
          <DirectMessageCard convo={convo} key={convo._id} />
        )
      )}
    </div>
  );
};

export default ConversationMixedList;
