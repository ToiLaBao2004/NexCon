import { Dialog, DialogPortal, DialogOverlay, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, KeyRound } from "lucide-react";
import { useChatStore } from "@/stores/useChatStore";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useState } from "react";
import { ConfirmationModal } from "@/components/shared/ConfirmationModal";
import { TransferAdminModal } from "./TransferAdminModal";

interface GroupManagementPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  isGroupAdmin: boolean;
}

import { Switch } from "@/components/ui/switch";
import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function GroupManagementPanel({ open, onOpenChange, conversationId, isGroupAdmin }: GroupManagementPanelProps) {
  const { disbandGroup, updateGroupSettings, conversations } = useChatStore();
  const [showConfirmDisband, setShowConfirmDisband] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);

  const conversation = conversations.find(c => c._id === conversationId);
  const isApprovalRequired = conversation?.group?.isApprovalRequired || false;
  const allowMembersChangeAvatar = conversation?.group?.allowMembersChangeAvatar !== false;
  const allowMembersCreateSharedReminder = conversation?.group?.allowMembersCreateSharedReminder !== false;
  const participants = conversation?.participants || [];

  const handleDisband = async () => {
    try {
      await disbandGroup(conversationId);
      setShowConfirmDisband(false);
      onOpenChange(false);
    } catch (error) {
      console.error("Lỗi khi giải tán nhóm:", error);
    }
  };

  const handleToggleApproval = async (checked: boolean) => {
    try {
      await updateGroupSettings(conversationId, { isApprovalRequired: checked });
    } catch (error) {
      console.error("Lỗi khi thay đổi chế độ phê duyệt:", error);
    }
  };

  const handleToggleMemberAvatar = async (checked: boolean) => {
    try {
      await updateGroupSettings(conversationId, { allowMembersChangeAvatar: checked });
    } catch (error) {
      console.error("Lỗi khi thay đổi quyền đổi tên và ảnh đại diện của nhóm:", error);
    }
  };

  const handleToggleSharedReminder = async (checked: boolean) => {
    try {
      await updateGroupSettings(conversationId, { allowMembersCreateSharedReminder: checked });
    } catch (error) {
      console.error("Lỗi khi thay đổi quyền tạo nhắc hẹn chung:", error);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogPortal>
          <DialogOverlay className="bg-transparent" />
          <DialogPrimitive.Content
            className="fixed inset-y-0 right-0 z-[201] m-0 flex w-screen flex-col rounded-none border-l border-border/40 bg-card p-0 shadow-2xl focus:outline-none sm:w-[380px] sm:max-w-full data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-right-full duration-300"
          >
            <div className="flex items-center gap-3 px-4 py-4 border-b border-border/40 bg-card shrink-0">
              <button
                onClick={() => onOpenChange(false)}
                className="p-1 rounded hover:bg-muted/10 transition-colors"
              >
                <ChevronLeft className="h-5 w-5" strokeWidth={2} />
              </button>
              <DialogHeader className="p-0">
                <DialogTitle className="text-[17px] font-semibold">Quản lý nhóm</DialogTitle>
              </DialogHeader>
            </div>

            <div className="flex-1 overflow-auto p-4 bg-card flex flex-col gap-6">
              {isGroupAdmin ? (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-medium text-foreground">Chế độ phê duyệt thành viên mới</span>
                      <TooltipProvider>
                        <Tooltip delayDuration={300}>
                          <TooltipTrigger>
                            <HelpCircle className="h-[18px] w-[18px] text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[200px] text-sm bg-accent border-0 text-foreground">
                            Khi bật, chỉ quản trị viên mới có thể đưa thành viên mới vào nhóm sau khi phê duyệt yêu cầu.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>
                      <Switch
                          checked={isApprovalRequired}
                          onCheckedChange={handleToggleApproval}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-medium text-foreground">Cho phép thành viên đổi tên và ảnh đại diện của nhóm</span>
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={allowMembersChangeAvatar}
                        onCheckedChange={handleToggleMemberAvatar}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-medium text-foreground">Cho phép thành viên tạo nhắc hẹn chung</span>
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={allowMembersCreateSharedReminder}
                        onCheckedChange={handleToggleSharedReminder}
                      />
                    </div>
                  </div>

                  <div className="mt-auto w-full pt-4 border-t border-border/40 flex flex-col gap-3">
                    <button
                      onClick={() => setShowTransferModal(true)}
                      className="flex items-center gap-3 w-full px-4 py-3 rounded-lg hover:bg-muted/10 transition-colors text-[15px] font-medium text-foreground border border-border/40"
                    >
                      <KeyRound className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                      Chuyển quyền trưởng nhóm
                    </button>

                    <button
                      onClick={() => setShowConfirmDisband(true)}
                      className="w-full text-red-500 bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 py-3 rounded-lg font-medium text-[15px] transition-colors"
                    >
                      Giải tán nhóm
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground/70">
                  <p className="text-sm">Thành viên không thể thực hiện thao tác quản lý nhóm lúc này.</p>
                </div>
              )}
            </div>
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>
      
      <TransferAdminModal
        open={showTransferModal}
        onOpenChange={setShowTransferModal}
        conversationId={conversationId}
        participants={participants}
        onSuccess={() => onOpenChange(false)}
      />

      <ConfirmationModal
        isOpen={showConfirmDisband}
        onClose={() => setShowConfirmDisband(false)}
        onConfirm={handleDisband}
        title="Giải tán nhóm?"
        description="Hành động này không thể hoàn tác!"
        confirmText="Giải tán nhóm"
        variant="destructive"
      />
    </>
  );
}
