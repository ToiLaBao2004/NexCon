"use client"

import * as React from "react"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar"
import NewGroupChatModal from "../chat/NewGroupModal"
import AddFriendModal from "../chat/AddFriendModal"
import ConversationMixedList from "../chat/ConversationMixedList"

import { cn } from "@/lib/utils"
import { useChatStore } from "@/stores/useChatStore"
import { useIsMobile } from "@/hooks/use-mobile"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const setFocusedConversation = useChatStore((s) => s.setFocusedConversation);
  const [isGroupModalOpen, setIsGroupModalOpen] = React.useState(false);
  const isMobile = useIsMobile();

  return (
    <Sidebar
      {...props}
      className={cn(
        "bg-card border border-border/80 shadow-none overflow-hidden",
        props.className
      )}
    >
      <SidebarContent
        className="overflow-hidden bg-card"
        onClick={() => setFocusedConversation(null)}
      >
        <div className="flex h-full min-h-0 flex-col" onClick={(e) => e.stopPropagation()}>
          {isMobile && (
            <div className="shrink-0 px-4 pt-4 pb-3 bg-card border-b border-border/70">
              <h1 className="text-[28px] leading-none font-bold tracking-tight text-primary">NextCon</h1>
            </div>
          )}

          <AddFriendModal />

          <SidebarGroup className="flex min-h-0 flex-1 flex-col">
            <SidebarGroupLabel asChild>
              <div className="uppercase flex items-center justify-between">
                <span>cuộc trò chuyện</span>
                <button
                  type="button"
                  onClick={() => setIsGroupModalOpen(true)}
                  className="normal-case text-xs font-medium px-2 py-1 rounded-md border border-border/60 bg-background hover:bg-muted/20 text-foreground transition-colors cursor-pointer"
                >
                  Tạo nhóm
                </button>
              </div>
            </SidebarGroupLabel>
            <SidebarGroupContent className="min-h-0 flex-1">
              <ConversationMixedList />
            </SidebarGroupContent>
          </SidebarGroup>
        </div>
      </SidebarContent>
      <NewGroupChatModal isOpen={isGroupModalOpen} onClose={() => setIsGroupModalOpen(false)} />
    </Sidebar>
  )
}
