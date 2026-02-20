import { useAuthStore } from "@/stores/useAuthStore";
import { useChatStore } from "@/stores/useChatStore";
import type { Conversation } from "@/types/chat";
import ChatCard from "./ChatCard";

const GroupChatCard = ({convo} : {convo: Conversation }) => {
    const {user} = useAuthStore();
    const {activeConversationId, setActiveConversation,messages} = useChatStore();

    if (!user) return null;

    const unreadCount = convo.unreadCounts[user._id];
    const name = convo.group?.name ?? "";
    const handleSelectConversation = async (id: string) => {
        setActiveConversation(id);
        if(!messages[id]) {
            // todo: fetch messages
        }
    }

    return (
        <ChatCard
        convoId={convo._id}
        name={name}
        timestamp={
            convo.lastMessage?.createdAt ? new Date(convo.lastMessage.createdAt)
            : undefined
        }
        isActive={activeConversationId === convo._id}
        onSelect={handleSelectConversation}
        unreadCount={unreadCount}
        leftSection={
            <>
            </>
        }
        subtitle={
            <p className="text-sm truncate text-muted-foreground">
                {convo.participants.length} Thành Viên
            </p>
        }        
        />
    )
}

export default GroupChatCard;