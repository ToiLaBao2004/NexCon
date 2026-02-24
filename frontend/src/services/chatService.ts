import api from '@/lib/axios';
import type { ConversationResponse, Message }  from '@/types/chat';

interface FetchMessageProps {
    messages: Message[];
    cursor?: string;
}

const pageLimit = 50;

export const chatService = {
    async fetchConversations(): Promise<ConversationResponse> {
        const res = await api.get("/conversations/get-conversations");
        return res.data;
    },
    async fetchMessages(id: string, cursor?:string) : Promise<FetchMessageProps> {
        const res = await api.get(`/conversations/${id}/messages?limit=${pageLimit}&cursor=${cursor}`);

        return {messages: res.data.messages, cursor: res.data.nexCursor};
    },
    async sendDirectMessage(recipientId:string, content:string = "", imgUrl?: string,conversationId?: string) {
        const res = await api.post("/messages/send-direct",{
            recipientId, content, imgUrl, conversationId
        })
        return  res.data.message;
    },
    async sendGroupMessage(conversationId :string, content:string = "", imgUrl?: string) {
        const res = await api.post("/messages/send-group",{
            conversationId, content, imgUrl
        })
        return  res.data.message;
    },
    async markAsSeen(conversationId: string) {
        const res = await api.patch(`/conversations/${conversationId}/mark-seen`);
        return res.data;
    }
};