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

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar variant="inset" {...props}>
      <SidebarContent className="beautiful-scrollbar overflow-x-hidden">
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
          <SidebarGroupAction title="Tạo Nhóm" className="cursor-pointer">
            <NewGroupChatModal />
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

      </SidebarContent>

    </Sidebar>
  )
}
