import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import ChatWindowLayout from "@/components/chat/ChatWindowLayout";

const ChatAppPage = () => {
  return (
    <SidebarProvider className="flex-1 w-full h-full relative">
      <AppSidebar
        className="
          md:left-20 
          top-2 bottom-2 
          h-[calc(100vh-16px)]
          bg-card/20
          backdrop-blur
          border border-border/40
          rounded-2xl
        "
      />
      <main className="flex-1 min-w-0 bg-card/20 rounded-2xl overflow-hidden shadow-soft border border-border/40 ml-0 md:ml-2">
        <ChatWindowLayout />
      </main>
    </SidebarProvider>
  );
}

export default ChatAppPage;