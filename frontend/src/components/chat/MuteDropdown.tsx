import React from 'react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { BellOff, Bell, MessageSquare, Phone, BellRing } from "lucide-react";
import { useChatStore } from "@/stores/useChatStore";
import { useAuthStore } from '@/stores/useAuthStore';
import { isMuted } from '@/utils/isMuted';
import { useMemo } from 'react';

interface MuteDropdownProps {
  conversationId: string;
  disabled?: boolean;
  children: React.ReactNode;
}

export function MuteDropdown({ conversationId, disabled, children }: MuteDropdownProps) {
  const { muteConversation, conversations } = useChatStore();
  const currentUserId = useAuthStore((s) => s.user?._id);

  const selectedConvo = useMemo(() => 
    conversations.find((c) => c._id === conversationId),
    [conversations, conversationId]
  );

  const myParticipant = useMemo(() => 
    selectedConvo?.participants?.find(
      (p) => (p.userId?._id || p.userId)?.toString() === currentUserId?.toString()
    ),
    [selectedConvo, currentUserId]
  );

  const isCurrentlyMuted = useMemo(() => {
    if (!myParticipant?.mute) return false;
    return isMuted(myParticipant.mute, "messages") || isMuted(myParticipant.mute, "meetings");
  }, [myParticipant]);

  const handleMute = async (target: 'messages' | 'meetings' | 'both', duration: '1h' | '8h' | '24h' | 'forever' | 'off') => {
    try {
      await muteConversation(conversationId, target, duration);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <BellOff className="h-4 w-4 mr-2" />
            Tắt thông báo
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Tin nhắn
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onSelect={() => handleMute('messages', '1h')}>Trong 1 giờ</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => handleMute('messages', '8h')}>Trong 8 giờ</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => handleMute('messages', '24h')}>Trong 24 giờ</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => handleMute('messages', 'forever')}>Cho đến khi mở lại</DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Phone className="h-4 w-4 mr-2" />
                  Cuộc gọi
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onSelect={() => handleMute('meetings', '1h')}>Trong 1 giờ</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => handleMute('meetings', '8h')}>Trong 8 giờ</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => handleMute('meetings', '24h')}>Trong 24 giờ</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => handleMute('meetings', 'forever')}>Cho đến khi mở lại</DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <BellRing className="h-4 w-4 mr-2" />
                  Tin nhắn và cuộc gọi
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onSelect={() => handleMute('both', '1h')}>Trong 1 giờ</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => handleMute('both', '8h')}>Trong 8 giờ</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => handleMute('both', '24h')}>Trong 24 giờ</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => handleMute('both', 'forever')}>Cho đến khi mở lại</DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
        {isCurrentlyMuted && (
          <DropdownMenuItem onSelect={() => handleMute('both', 'off')} className="text-primary focus:text-primary">
            <Bell className="h-4 w-4 mr-2" />
            Mở lại thông báo
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
