import { useState, useRef, useEffect } from "react";
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
import { Camera, ChevronDown, Eye, Loader2, LockKeyhole, UsersRound } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import EditMusicProfile from "@/components/ui/editmusicprofile";
import { FIELD_LIMITS, checkFieldFormat } from "@/lib/fieldFormat";
import { ImageCropDialog, type CropPreset } from "@/components/shared/ImageCropDialog";
import { validateImageFile } from "@/lib/imageCrop";
import { UserProfileDialog } from "@/components/shared/UserProfileDialog";
import { getApiErrorMessage } from "@/lib/apiMessage";
import type { ProfileVisibility } from "@/types/user";

interface ProfileEditDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const avatarCropPresets: CropPreset[] = [
    { id: "square", label: "1:1", aspect: 1, outputWidth: 1024, outputHeight: 1024 },
];

const profileVisibilityOptions: Array<{
    value: ProfileVisibility;
    label: string;
    icon: typeof Eye;
}> = [
        { value: "public", label: "Công khai", icon: Eye },
        { value: "friends", label: "Chỉ bạn bè", icon: UsersRound },
        { value: "private", label: "Chỉ mình tôi", icon: LockKeyhole },
    ];

const getUploadErrorMessage = (error: unknown, fallback: string) => {
    return getApiErrorMessage(error, fallback);
};

export function ProfileEditDialog({ open, onOpenChange }: ProfileEditDialogProps) {
    const { user, updateProfile, updateAvatar } = useAuthStore();

    const [loading, setLoading] = useState(false);
    const [uploadingTarget, setUploadingTarget] = useState<"avatar" | null>(null);
    const [uploadProgress, setUploadProgress] = useState<number | null>(null);
    const [avatarCropFile, setAvatarCropFile] = useState<File | null>(null);
    const [previewOpen, setPreviewOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const uploading = uploadingTarget !== null;

    const [formData, setFormData] = useState({
        displayName: user?.displayName || "",
        bio: user?.bio || "",
        phone: user?.phone || "",
        profileVisibility: (user?.profileVisibility || "public") as ProfileVisibility,
    });

    useEffect(() => {
        if (open && user) {
            setFormData({
                displayName: user.displayName || "",
                bio: user.bio || "",
                phone: user.phone || "",
                profileVisibility: (user.profileVisibility || "public") as ProfileVisibility,
            });
        }
    }, [open, user]);

    useEffect(() => {
        if (!open) setPreviewOpen(false);
    }, [open]);

    const previewUser = user ? {
        _id: user._id,
        displayName: formData.displayName.trim() || user.displayName || "User",
        email: user.email,
        avatarUrl: user.avatarUrl,
        bio: formData.bio,
        phone: formData.phone,
        music: user.music,
        profileVisibility: formData.profileVisibility,
    } : null;

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
        const displayNameError = checkFieldFormat("displayName", formData.displayName);
        const phoneError = checkFieldFormat("phone", formData.phone);
        if (displayNameError || phoneError) {
            toast.error(displayNameError || phoneError);
            return;
        }

        try {
            setLoading(true);
            await updateProfile(formData);
            onOpenChange(false);
            toast.success("Cập nhật thông tin thành công!");
        } catch (error: any) {
            toast.error(getApiErrorMessage(error, "Cập nhật thất bại"));
        } finally {
            setLoading(false);
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;

        const error = validateImageFile(file);
        if (error) {
            toast.error(error);
            return;
        }

        setAvatarCropFile(file);
    };

    const handleAvatarCropConfirm = async (file: File) => {
        try {
            setUploadingTarget("avatar");
            setUploadProgress(0);
            await updateAvatar(file, setUploadProgress);
            setAvatarCropFile(null);
            toast.success("Cập nhật ảnh đại diện thành công!");
        } catch (error: unknown) {
            toast.error(getUploadErrorMessage(error, "Upload ảnh thất bại"));
        } finally {
            setUploadingTarget(null);
            setUploadProgress(null);
        }
    };

    const selectedProfileVisibility = profileVisibilityOptions.find(
        (option) => option.value === formData.profileVisibility
    ) || profileVisibilityOptions[0];
    const SelectedProfileVisibilityIcon = selectedProfileVisibility.icon;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-screen h-[100dvh] max-w-none rounded-none border-0 p-4 sm:h-auto 
        sm:max-w-[1000px] sm:rounded-2xl sm:border sm:p-6 overflow-y-auto beautiful-scrollbar">

                <DialogHeader className="mb-4">
                    <DialogTitle className="text-xl font-semibold">Chỉnh sửa hồ sơ</DialogTitle>
                    <DialogDescription>
                        Cập nhật thông tin cá nhân và nhạc trên profile của bạn.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-6">
                    {/* ==================== CỘT TRÁI ==================== */}
                    <div className="space-y-4">
                        {/* Avatar */}
                        <div className="flex flex-col items-center gap-2">
                            <div className="relative group">
                                <Avatar className="h-24 w-24 border-4 border-primary/10 shadow-md">
                                    <AvatarImage src={user?.avatarUrl} alt={user?.displayName} />
                                    <AvatarFallback className="text-4xl font-bold bg-primary/10 text-primary">
                                        {user?.displayName?.charAt(0) || "?"}
                                    </AvatarFallback>
                                </Avatar>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploading}
                                    className="absolute inset-0 flex items-center justify-center bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all"
                                >
                                    {uploadingTarget === "avatar" ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
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

                        {/* Tên hiển thị */}
                        <div className="grid gap-1.5">
                            <Label htmlFor="displayName" className="flex justify-between">
                                <span>Tên hiển thị</span>
                                <span className="text-xs text-muted-foreground">
                                    {formData.displayName.trim().length}/{FIELD_LIMITS.displayName}
                                </span>
                            </Label>
                            <Input
                                id="displayName"
                                value={formData.displayName}
                                onChange={handleInputChange}
                                placeholder="Nhập tên hiển thị"
                                className="h-10"
                            />
                        </div>

                        {/* Số điện thoại */}
                        <div className="grid gap-1.5">
                            <Label htmlFor="phone" className="flex justify-between">
                                <span>Số điện thoại</span>
                                <span className="text-xs text-muted-foreground">
                                    {formData.phone.trim().length}/{FIELD_LIMITS.phone}
                                </span>
                            </Label>
                            <Input
                                id="phone"
                                type="tel"
                                value={formData.phone}
                                onChange={handleInputChange}
                                placeholder="Nhập số điện thoại"
                                className="h-10"
                            />
                        </div>

                        {/* Tiểu sử */}
                        <div className="grid gap-1.5">
                            <Label htmlFor="bio" className="flex justify-between">
                                <span>Tiểu sử</span>
                                <span className="text-xs text-muted-foreground">
                                    {formData.bio.length}/150
                                </span>
                            </Label>
                            <Textarea
                                id="bio"
                                value={formData.bio}
                                onChange={handleInputChange}
                                placeholder="Kể chút về bản thân bạn..."
                                className="resize-none min-h-[90px]"
                                maxLength={150}
                            />
                        </div>
                    </div>

                    {/* ==================== CỘT PHẢI ==================== */}
                    <div className="space-y-4">
                        <div>
                            <Label className="mb-2 block text-sm font-medium">Nhạc trên profile</Label>
                            <EditMusicProfile />
                        </div>

                        <div className="grid gap-2">
                            <Label className="text-sm font-medium">Quyền riêng tư hồ sơ</Label>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="h-11 w-full justify-between rounded-xl px-3 text-sm font-semibold"
                                    >
                                        <span className="flex min-w-0 items-center gap-2">
                                            <SelectedProfileVisibilityIcon className="h-4 w-4 shrink-0 text-primary" />
                                            <span className="truncate">{selectedProfileVisibility.label}</span>
                                        </span>
                                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="z-[250] w-[var(--radix-dropdown-menu-trigger-width)] rounded-xl">
                                    <DropdownMenuRadioGroup
                                        value={formData.profileVisibility}
                                        onValueChange={(value) => setFormData((prev) => ({
                                            ...prev,
                                            profileVisibility: value as ProfileVisibility,
                                        }))}
                                    >
                                        {profileVisibilityOptions.map((option) => {
                                            const Icon = option.icon;

                                            return (
                                                <DropdownMenuRadioItem
                                                    key={option.value}
                                                    value={option.value}
                                                    className="py-2 text-sm font-medium"
                                                >
                                                    <Icon className="h-4 w-4 text-primary" />
                                                    {option.label}
                                                </DropdownMenuRadioItem>
                                            );
                                        })}
                                    </DropdownMenuRadioGroup>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <DialogFooter className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setPreviewOpen(true)}
                        disabled={!user || loading || uploading}
                        className="sm:flex-1"
                    >
                        <Eye className="h-4 w-4" />
                        Xem trước
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={loading || uploading}
                        className="sm:flex-1"
                    >
                        Hủy
                    </Button>
                    <Button
                        type="button"
                        onClick={handleSave}
                        disabled={loading || uploading}
                        className="sm:flex-1"
                    >
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Lưu thay đổi
                    </Button>
                </DialogFooter>
            </DialogContent>

            <ImageCropDialog
                file={avatarCropFile}
                open={Boolean(avatarCropFile)}
                title="Chỉnh ảnh đại diện"
                cropShape="round"
                presets={avatarCropPresets}
                defaultPresetId="square"
                confirmLabel="Lưu ảnh"
                maxOutputBytes={1024 * 1024}
                uploadProgress={uploadingTarget === "avatar" ? uploadProgress : null}
                onCancel={() => setAvatarCropFile(null)}
                onConfirm={handleAvatarCropConfirm}
            />

            <UserProfileDialog
                user={previewUser}
                open={previewOpen}
                onOpenChange={setPreviewOpen}
                previewAsOther
            />

        </Dialog>
    );
}
