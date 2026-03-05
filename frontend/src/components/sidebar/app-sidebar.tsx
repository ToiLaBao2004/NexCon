"use client"

import * as React from "react"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar"
import CreateNewChat from "../chat/CreateNewChat"
import NewGroupChatModal from "../chat/NewGroupModal"
import GroupChatList from "../chat/GroupChatList"
import AddFriendModal from "../chat/AddFriendModal"
import DirectMessageList from "../chat/DirectMessageList"

import { cn } from "@/lib/utils"
import { useChatStore } from "@/stores/useChatStore"
import { Plus } from "lucide-react"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const setFocusedConversation = useChatStore((s) => s.setFocusedConversation);
  const [isGroupModalOpen, setIsGroupModalOpen] = React.useState(false);

  return (
    <Sidebar
      {...props}
      className={cn(
        "bg-card border border-border/40 rounded-2xl shadow-soft overflow-hidden",
        props.className
      )}
    >
      <SidebarContent
        className="beautiful-scrollbar overflow-x-hidden"
        onClick={() => setFocusedConversation(null)}
      >
        <div onClick={(e) => e.stopPropagation()}>
          <AddFriendModal />
          <SidebarGroup>
            <SidebarGroupContent>
              <CreateNewChat />
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel className="uppercase">
              nhóm chat
            </SidebarGroupLabel>
            <SidebarGroupAction
              title="Tạo Nhóm"
              className="cursor-pointer"
              onClick={() => setIsGroupModalOpen(true)}
            >
              <Plus className="h-4 w-4" />
            </SidebarGroupAction>
            <SidebarGroupContent>
              <GroupChatList />
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel className="uppercase">
              bạn bè
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <DirectMessageList />
            </SidebarGroupContent>
          </SidebarGroup>
        </div>
      </SidebarContent>
      <NewGroupChatModal isOpen={isGroupModalOpen} onClose={() => setIsGroupModalOpen(false)} />
    </Sidebar>
  )
}
