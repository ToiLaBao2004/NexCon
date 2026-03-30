import { useState } from "react";
import UserAvatar from "./UserAvatar";
import { Dialog, DialogPortal, DialogOverlay, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Users, ArrowLeft, MoreHorizontal, UserCircle, UserMinus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { UserProfileDialog } from "../shared/UserProfileDialog";

interface Props {
  participants: any[];
  memberCount?: number;
  isGroupAdmin?: boolean;
  currentUserId?: string;
}

export default function MembersPanel({ participants, memberCount, isGroupAdmin, currentUserId }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const handleShowProfile = (user: any) => {
    setSelectedUser(user);
    setIsProfileOpen(true);
  };

  return (
    <>
      <div
        role="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 px-4 py-3 text-foreground hover:bg-muted/10 transition-colors bg-card font-normal cursor-pointer"
      >
        <Users className="h-5 w-5 text-muted-foreground/70 shrink-0" strokeWidth={1.5} />
        <span className="text-[15px]">{`${memberCount ?? participants.length} thành viên`}</span>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPortal>
          <DialogOverlay />
          <div className="fixed inset-y-0 right-0 w-[340px] sm:w-[340px] p-0 m-0 rounded-none shadow-2xl bg-card border-l border-border/40 z-50">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40 bg-card">
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-muted/10">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <DialogHeader className="p-0">
                <DialogTitle className="text-base font-medium">Thành viên</DialogTitle>
              </DialogHeader>
            </div>

            <div className="p-1 overflow-y-auto h-[calc(100%-57px)] bg-card beautiful-scrollbar">
              <div className="flex flex-col gap-0.5">
                {participants.map((p: any) => {
                  const u = p.userId || p;
                  const name = u?.displayName || u?.email || "Người dùng";
                  const isMe = u?._id?.toString() === currentUserId?.toString();

                  return (
                    <div
                      key={p._id || u?._id || name}
                      className="group flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-muted/10 text-left transition-colors"
                    >
                      <div
                        className="shrink-0 cursor-pointer"
                        onClick={() => handleShowProfile(u)}
                      >
                        <UserAvatar type="sidebar" name={name} avatarUrl={u?.avatarUrl} className="!h-9 !w-9 !text-sm border border-border/10" />
                      </div>
                      <div
                        className="flex-1 cursor-pointer min-w-0"
                        onClick={() => handleShowProfile(u)}
                      >
                        <div className="font-medium text-[14px] text-foreground truncate">{name}</div>
                        {u?.email && <div className="text-[11.5px] text-muted-foreground truncate leading-tight">{u.email}</div>}
                      </div>

                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1.5 rounded-full hover:bg-muted/20 opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => handleShowProfile(u)}>
                            <UserCircle className="mr-2 h-4 w-4" />
                            <span>Xem thông tin</span>
                          </DropdownMenuItem>

                          {isGroupAdmin && !isMe && (
                            <DropdownMenuItem className="text-destructive focus:text-destructive">
                              <UserMinus className="mr-2 h-4 w-4" />
                              <span>Xóa khỏi nhóm</span>
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </DialogPortal>
      </Dialog>

      {selectedUser && (
        <UserProfileDialog
          open={isProfileOpen}
          onOpenChange={setIsProfileOpen}
          user={{
            _id: selectedUser._id,
            displayName: selectedUser.displayName,
            email: selectedUser.email,
            avatarUrl: selectedUser.avatarUrl,
            bio: selectedUser.bio,
            phone: selectedUser.phone
          }}
        />
      )}
    </>
  );
}
