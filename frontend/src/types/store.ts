import type { Conversation, Message } from "./chat";

export interface ThemeState {
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (dark: boolean) => void;
}

export interface ChatState {
  conversations: Conversation[];
  messages: Record<string, {
    items: Message[],
    hasMore: boolean, 
    nextCursor?: string | null,
  }>;
  activeConversationId: string | null; 
  loading: boolean;
  reset: () => void;

  setActiveConversation: (id:string | null ) => void;
  fetchConversations: () => Promise<void>;
}