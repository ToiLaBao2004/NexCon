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
    }
};