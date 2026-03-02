import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import ChatWindowLayout from "@/components/chat/ChatWindowLayout";

const ChatAppPage = () => {
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "300px" } as React.CSSProperties}
      className="flex h-full w-full relative min-h-0"
    >
      <AppSidebar
        collapsible="none"
        className="h-full"
      />
      <main className="flex-1 min-w-0 bg-card rounded-2xl overflow-hidden shadow-soft border border-border/40 ml-2 h-full">
        <ChatWindowLayout />
      </main>
    </SidebarProvider>
  );
}

export default ChatAppPage;