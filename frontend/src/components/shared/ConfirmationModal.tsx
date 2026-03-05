import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description: string;
    confirmText?: string;
    variant?: "default" | "destructive";
    isLoading?: boolean;
}

export const ConfirmationModal = ({
    isOpen, onClose, onConfirm, title, description,
    confirmText = "Xác nhận", variant = "default", isLoading = false
}: ConfirmationModalProps) => (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="sm:max-w-[400px] rounded-2xl">
            <DialogHeader>
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-row gap-2 mt-2">
                <Button variant="ghost" onClick={onClose} disabled={isLoading} className="flex-1">Hủy</Button>
                <Button variant={variant} onClick={onConfirm} disabled={isLoading} className="flex-1">
                    {isLoading ? "Đang xử lý..." : confirmText}
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
);
