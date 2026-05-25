import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { useChatStore } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";
import UserAvatar from "./UserAvatar";
import { ConfirmationModal } from "@/components/shared/ConfirmationModal";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const getMemberDisplayName = (member: any) => member?.nickname?.trim() || member?.displayName || "Người dùng";

interface TransferAdminModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  participants: any[];
  onSuccess?: () => void;
}

export function TransferAdminModal({ 
  open, 
  onOpenChange, 
  conversationId, 
  participants,
  onSuccess
}: TransferAdminModalProps) {
  const { user: currentUser } = useAuthStore();
  const { transferAdminRole } = useChatStore();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Filter out current user and apply search query
  const filteredMembers = useMemo(() => {
    return participants
      .map(p => p.userId || p)
      .filter(u => u._id !== currentUser?._id)
      .filter(u => {
        const name = getMemberDisplayName(u).toLowerCase();
        return name.includes(searchQuery.toLowerCase());
      });
  }, [participants, currentUser?._id, searchQuery]);

  const selectedMember = useMemo(() => {
    return participants.find(p => (p.userId?._id || p._id) === selectedMemberId)?.userId || null;
  }, [selectedMemberId, participants]);

  const handleTransfer = async () => {
    if (!selectedMemberId) return;
    
    try {
      setIsLoading(true);
      await transferAdminRole(conversationId, selectedMemberId);
      toast.success("Đã chuyển quyền trưởng nhóm thành công");
      setShowConfirm(false);
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast.error(error.message || "Không thể chuyển quyền trưởng nhóm");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px] p-0 gap-0 overflow-hidden flex flex-col max-h-[85vh] z-[210]">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle className="text-center text-lg font-semibold">Chọn trưởng nhóm mới</DialogTitle>
          </DialogHeader>

          <div className="p-4 bg-background">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
              <Input
                placeholder="Tìm kiếm thành viên..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-muted/20 border-none focus-visible:ring-1 focus-visible:ring-primary rounded-full h-10"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-2 min-h-[300px] beautiful-scrollbar">
            {filteredMembers.length > 0 ? (
              <div className="space-y-0.5">
                {filteredMembers.map((member) => {
                  const memberName = getMemberDisplayName(member);
                  return (
                    <label
                      key={member._id}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-200 hover:bg-muted/30 group relative",
                        selectedMemberId === member._id && "bg-primary/5 hover:bg-primary/10"
                      )}
                    >
                      <div className="relative flex items-center justify-center">
                        <input
                          type="radio"
                          name="new-admin"
                          checked={selectedMemberId === member._id}
                          onChange={() => setSelectedMemberId(member._id)}
                          className="peer h-5 w-5 cursor-pointer appearance-none rounded-full border-2 border-muted-foreground/30 transition-all checked:border-primary checked:bg-primary"
                        />
                        <div className="absolute h-2.5 w-2.5 scale-0 rounded-full bg-white transition-transform duration-200 peer-checked:scale-100" />
                      </div>

                      <UserAvatar
                        type="sidebar"
                        name={memberName}
                        avatarUrl={member.avatarUrl}
                        className="h-10 w-10 border border-border/10 ml-1"
                      />

                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-medium text-foreground truncate">
                          {memberName}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-10">
                <p className="text-sm">Không tìm thấy thành viên nào</p>
              </div>
            )}
          </div>

          <DialogFooter className="p-4 border-t gap-3 sm:gap-2 sm:justify-end bg-muted/5">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-full px-6 font-medium bg-transparent hover:bg-muted/30"
            >
              Hủy
            </Button>
            <Button
              disabled={!selectedMemberId}
              onClick={() => setShowConfirm(true)}
              className="rounded-full px-6 bg-[#0091ff] hover:bg-[#007edb] text-white transition-all disabled:opacity-50"
            >
              Chọn và tiếp tục
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationModal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleTransfer}
        title="Xác nhận chuyển quyền trưởng nhóm"
        description={`Bạn có chắc muốn chuyển quyền trưởng nhóm cho ${selectedMember ? getMemberDisplayName(selectedMember) : 'thành viên này'}? Bạn sẽ mất quyền quản lý nhóm sau khi xác nhận.`}

        confirmText="Xác nhận chuyển"
        variant="destructive"
        isLoading={isLoading}
      />
    </>
  );
}
