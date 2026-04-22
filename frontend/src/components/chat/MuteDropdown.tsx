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
import { useChatStore } from "@/stores/useChatStore";

interface MuteDropdownProps {
  conversationId: string;
  disabled?: boolean;
  children: React.ReactNode;
}

export function MuteDropdown({ conversationId, disabled, children }: MuteDropdownProps) {
  const { muteConversation } = useChatStore();

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
          <DropdownMenuSubTrigger>Tắt thông báo</DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Tin nhắn</DropdownMenuSubTrigger>
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
                <DropdownMenuSubTrigger>Cuộc gọi</DropdownMenuSubTrigger>
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
                <DropdownMenuSubTrigger>Tin nhắn và cuộc gọi</DropdownMenuSubTrigger>
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
        <DropdownMenuItem onSelect={() => handleMute('both', 'off')} className="text-primary focus:text-primary">
          Mở lại thông báo
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
