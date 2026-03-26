import { Dialog, DialogPortal, DialogOverlay, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft } from "lucide-react";
import { useChatStore } from "@/stores/useChatStore";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useState } from "react";
import { ConfirmationModal } from "@/components/shared/ConfirmationModal";

interface GroupManagementPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  isGroupAdmin: boolean;
}

export function GroupManagementPanel({ open, onOpenChange, conversationId, isGroupAdmin }: GroupManagementPanelProps) {
  const { disbandGroup } = useChatStore();
  const [showConfirmDisband, setShowConfirmDisband] = useState(false);

  const handleDisband = async () => {
    try {
      await disbandGroup(conversationId);
      setShowConfirmDisband(false);
      onOpenChange(false);
    } catch (error) {
      console.error("Lỗi khi giải tán nhóm:", error);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogPortal>
          <DialogOverlay className="bg-transparent" />
          <DialogPrimitive.Content
            className="fixed inset-y-0 right-0 w-[350px] p-0 m-0 rounded-none shadow-2xl bg-card border-l border-border/40 z-50 flex flex-col focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-right-full duration-300"
          >
            <div className="flex items-center gap-3 px-4 py-4 border-b border-border/40 bg-card shrink-0">
              <button
                onClick={() => onOpenChange(false)}
                className="p-1 rounded hover:bg-muted/10 transition-colors"
              >
                <ArrowLeft className="h-5 w-5" strokeWidth={2} />
              </button>
              <DialogHeader className="p-0">
                <DialogTitle className="text-[17px] font-semibold">Quản lý nhóm</DialogTitle>
              </DialogHeader>
            </div>

            <div className="flex-1 overflow-auto p-4 bg-card flex flex-col">
              {isGroupAdmin ? (
                <div className="mt-auto w-full pt-4">
                  <button
                    onClick={() => setShowConfirmDisband(true)}
                    className="w-full text-red-500 bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 py-3 rounded-lg font-medium text-[15px] transition-colors"
                  >
                    Giải tán nhóm
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground/70">
                  <p className="text-sm">Thành viên không thể thực hiện thao tác quản lý nhóm lúc này.</p>
                </div>
              )}
            </div>
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>
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
