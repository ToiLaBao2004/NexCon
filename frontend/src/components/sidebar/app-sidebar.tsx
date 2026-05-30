"use client"

import * as React from "react"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
} from "@/components/ui/sidebar"
import NewGroupChatModal from "../chat/NewGroupModal"
import AddFriendModal from "../chat/AddFriendModal"
import ConversationMixedList, { type ConversationFilter } from "../chat/ConversationMixedList"

import { cn } from "@/lib/utils"
import { useChatStore } from "@/stores/useChatStore"
import { useIsMobile } from "@/hooks/use-mobile"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const setFocusedConversation = useChatStore((s) => s.setFocusedConversation);
  const [isGroupModalOpen, setIsGroupModalOpen] = React.useState(false);
  const [isAddFriendModalOpen, setIsAddFriendModalOpen] = React.useState(false);
  const [conversationFilter, setConversationFilter] = React.useState<ConversationFilter>("all");
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
              <h1 className="text-[28px] leading-none font-bold tracking-tight text-primary">NexCon</h1>
            </div>
          )}

          <SidebarGroup className="flex min-h-0 flex-1 flex-col px-5">
            <SidebarGroupContent className="min-h-0 flex-1">
              <ConversationMixedList
                conversationFilter={conversationFilter}
                onChangeFilter={setConversationFilter}
                onAddFriend={() => setIsAddFriendModalOpen(true)}
                onCreateGroup={() => setIsGroupModalOpen(true)}
              />
            </SidebarGroupContent>
          </SidebarGroup>
        </div>
      </SidebarContent>
      <AddFriendModal isOpen={isAddFriendModalOpen} onClose={() => setIsAddFriendModalOpen(false)} />
      <NewGroupChatModal isOpen={isGroupModalOpen} onClose={() => setIsGroupModalOpen(false)} />
    </Sidebar>
  )
}
