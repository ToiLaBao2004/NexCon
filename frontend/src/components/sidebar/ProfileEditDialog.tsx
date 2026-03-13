import { useState, useRef } from "react";
import { useAuthStore } from "@/stores/useAuthStore";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, Loader2 } from "lucide-react";

interface ProfileEditDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function ProfileEditDialog({ open, onOpenChange }: ProfileEditDialogProps) {
    const { user, updateProfile, updateAvatar } = useAuthStore();
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [formData, setFormData] = useState({
        displayName: user?.displayName || "",
        bio: user?.bio || "",
        phone: user?.phone || "",
    });

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { id, value } = e.target;

        if (id === "phone") {
            const numericValue = value.replace(/\D/g, "");
            setFormData((prev) => ({ ...prev, [id]: numericValue }));
            return;
        }

        if (id === "bio") {
            if (value.length <= 150) {
                setFormData((prev) => ({ ...prev, [id]: value }));
            }
            return;
        }

        setFormData((prev) => ({ ...prev, [id]: value }));
    };

    const handleSave = async () => {
        try {
            setLoading(true);
            await updateProfile(formData);
            onOpenChange(false);
            toast.success("Cập nhật thông tin thành công");
        } catch (error: any) {
            toast.error(error.response?.data?.message || "Cập nhật thất bại");
        } finally {
            setLoading(false);
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Kiểm tra định dạng và dung lượng
        if (!file.type.startsWith("image/")) {
            toast.error("Vui lòng chọn tệp hình ảnh");
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            toast.error("Ảnh quá lớn (tối đa 2MB)");
            return;
        }

        try {
            setUploading(true);
            await updateAvatar(file);
            toast.success("Cập nhật ảnh đại diện thành Công!");
        } catch (error: any) {
            toast.error(error.response?.data?.message || "Upload ảnh thất bại");
        } finally {
            setUploading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-screen h-[100dvh] max-w-none rounded-none border-0 top-0 left-0 translate-x-0 translate-y-0 overflow-y-auto p-4 sm:h-auto sm:max-w-[425px] sm:rounded-lg sm:border sm:top-[50%] sm:left-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:p-6">
                <DialogHeader>
                    <DialogTitle>Chỉnh sửa hồ sơ</DialogTitle>
                    <DialogDescription>
                        Cập nhật thông tin cá nhân và ảnh đại diện của bạn.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="flex flex-col items-center gap-4 mb-4">
                        <div className="relative group">
                            <Avatar className="h-24 w-24 border-2 border-primary/20">
                                <AvatarImage src={user?.avatarUrl} alt={user?.displayName} />
                                <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
                                    {user?.displayName?.charAt(0)}
                                </AvatarFallback>
                            </Avatar>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading}
                                className="absolute inset-0 flex items-center justify-center bg-black/40 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                {uploading ? (
                                    <Loader2 className="h-6 w-6 animate-spin" />
                                ) : (
                                    <Camera className="h-6 w-6" />
                                )}
                            </button>
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept="image/*"
                                onChange={handleFileChange}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">Nhấp vào ảnh để thay đổi</p>
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="displayName">Tên hiển thị</Label>
                        <Input
                            id="displayName"
                            value={formData.displayName}
                            onChange={handleInputChange}
                            placeholder="Nhập tên của bạn"
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="phone">Số điện thoại</Label>
                        <Input
                            id="phone"
                            type="tel"
                            value={formData.phone}
                            onChange={handleInputChange}
                            placeholder="Số điện thoại"
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="bio" className="flex justify-between">
                            <span>Tiểu sử</span>
                            <span className="text-[10px] text-muted-foreground">{formData.bio.length}/150</span>
                        </Label>
                        <Textarea
                            id="bio"
                            value={formData.bio}
                            onChange={handleInputChange}
                            placeholder="Kể chút về bản thân bạn..."
                            className="resize-none"
                            rows={3}
                            maxLength={150}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={(e) => {
                            e.preventDefault();
                            onOpenChange(false);
                        }}
                        disabled={loading}
                    >
                        Hủy
                    </Button>
                    <Button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleSave();
                        }}
                        disabled={loading || uploading}
                    >
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Lưu thay đổi
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
