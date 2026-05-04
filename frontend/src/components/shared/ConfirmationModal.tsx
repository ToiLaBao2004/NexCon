import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
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
        <DialogPortal>
            <DialogOverlay className="z-[100000]" />
            <DialogPrimitive.Content className="bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-[100001] grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-2xl border p-6 shadow-lg duration-200 outline-none sm:max-w-[400px]">
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
            </DialogPrimitive.Content>
        </DialogPortal>
    </Dialog>
);
