import { useState } from "react";
import UserAvatar from "./UserAvatar";
import { Dialog, DialogPortal, DialogOverlay, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Users } from "lucide-react";
import { ArrowLeft } from "lucide-react";

interface Props {
  participants: any[];
  memberCount?: number;
}

export default function MembersPanel({ participants, memberCount }: Props) {
  const [open, setOpen] = useState(false);

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

            <div className="p-3 overflow-auto h-full bg-card">
              <div className="flex flex-col gap-1">
                {participants.map((p: any) => {
                  const u = p.userId || p;
                  const name = u?.displayName || u?.email || "Người dùng";
                  return (
                    <button
                      key={p._id || u?._id || name}
                      className="flex items-center gap-3 w-full px-3 py-2 rounded hover:bg-muted/10 text-left"
                    >
                      <div className="shrink-0">
                        <UserAvatar type="sidebar" name={name} avatarUrl={u?.avatarUrl} className="!h-8 !w-8 !text-sm" />
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-sm text-foreground">{name}</div>
                        {u?.email && <div className="text-xs text-muted-foreground truncate">{u.email}</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </DialogPortal>
      </Dialog>
    </>
  );
}
