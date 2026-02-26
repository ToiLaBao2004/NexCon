import { useChatStore } from "@/stores/useChatStore";
import DirectMessageCard from "./DirectMessageCard";
import { useEffect } from "react";

const DirectMessageList = () => {
  const { conversations, fetchConversations } = useChatStore();

  useEffect(() => {
    fetchConversations();
  }, []);

  if (!conversations) return;
  const directConversations = conversations.filter((convo) => convo.type === 'direct');
  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-2">
      {
        directConversations.map((convo) => (
          <DirectMessageCard convo={convo} key={convo._id} />
        ))
      }
    </div>
  );
};

export default DirectMessageList;