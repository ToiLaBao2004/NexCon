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
import { Camera, Loader2 } from "lucide-react";
import EditMusicProfile from "@/components/ui/editmusicprofile";
import { FIELD_LIMITS, checkFieldFormat } from "@/lib/fieldFormat";
import { ImageCropDialog, type CropPreset } from "@/components/shared/ImageCropDialog";
import { validateImageFile } from "@/lib/imageCrop";

interface ProfileEditDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const avatarCropPresets: CropPreset[] = [
    { id: "square", label: "1:1", aspect: 1, outputWidth: 512, outputHeight: 512 },
];

const coverCropPresets: CropPreset[] = [
    { id: "wide", label: "16:9", aspect: 16 / 9, outputWidth: 1280, outputHeight: 720 },
    { id: "source", label: "Gốc", aspect: "source", maxDimension: 1600 },
];

const getUploadErrorMessage = (error: unknown, fallback: string) => {
    const maybeError = error as { response?: { data?: { message?: string } } };
    return maybeError.response?.data?.message || fallback;
};

export function ProfileEditDialog({ open, onOpenChange }: ProfileEditDialogProps) {
    const { user, updateProfile, updateAvatar, updateCover } = useAuthStore();

    const [loading, setLoading] = useState(false);
    const [uploadingTarget, setUploadingTarget] = useState<"avatar" | "cover" | null>(null);
    const [uploadProgress, setUploadProgress] = useState<number | null>(null);
    const [avatarCropFile, setAvatarCropFile] = useState<File | null>(null);
    const [coverCropFile, setCoverCropFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const coverInputRef = useRef<HTMLInputElement>(null);
    const uploading = uploadingTarget !== null;

    const [formData, setFormData] = useState({
        displayName: user?.displayName || "",
        bio: user?.bio || "",
        phone: user?.phone || "",
    });

    useEffect(() => {
        if (open && user) {
            setFormData({
                displayName: user.displayName || "",
                bio: user.bio || "",
                phone: user.phone || "",
            });
        }
    }, [open, user]);

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
            toast.error(error.response?.data?.message || "Cập nhật thất bại");
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

    const handleCoverFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;

        const error = validateImageFile(file);
        if (error) {
            toast.error(error);
            return;
        }

        setCoverCropFile(file);
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

    const handleCoverCropConfirm = async (file: File) => {
        try {
            setUploadingTarget("cover");
            setUploadProgress(0);
            await updateCover(file, setUploadProgress);
            setCoverCropFile(null);
            toast.success("Cập nhật ảnh bìa thành công!");
        } catch (error: unknown) {
            toast.error(getUploadErrorMessage(error, "Upload ảnh bìa thất bại"));
        } finally {
            setUploadingTarget(null);
            setUploadProgress(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-screen h-[100dvh] max-w-none rounded-none border-0 p-4 sm:h-auto 
        sm:max-w-[1000px] sm:rounded-2xl sm:border sm:p-6 overflow-y-auto">

                <DialogHeader className="mb-4">
                    <DialogTitle className="text-xl font-semibold">Chỉnh sửa hồ sơ</DialogTitle>
                    <DialogDescription>
                        Cập nhật thông tin cá nhân và nhạc trên profile của bạn.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-6">
                    {/* ==================== CỘT TRÁI ==================== */}
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-border/70 bg-muted shadow-sm">
                                {user?.coverUrl ? (
                                    <img
                                        src={user.coverUrl}
                                        alt="Ảnh bìa"
                                        className="h-full w-full object-cover"
                                    />
                                ) : (
                                    <div className="h-full w-full bg-gradient-to-br from-primary/25 via-sky-500/15 to-emerald-400/20" />
                                )}
                                <button
                                    type="button"
                                    onClick={() => coverInputRef.current?.click()}
                                    disabled={uploading}
                                    className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/40 bg-black/55 text-white shadow-lg backdrop-blur transition-colors hover:bg-black/70 disabled:cursor-not-allowed disabled:opacity-70"
                                    title="Đổi ảnh bìa"
                                >
                                    {uploadingTarget === "cover" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                                </button>
                                <input
                                    type="file"
                                    ref={coverInputRef}
                                    className="hidden"
                                    accept="image/*"
                                    onChange={handleCoverFileChange}
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">Ảnh bìa hiển thị trên profile của bạn</p>
                        </div>

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
                    </div>
                </div>

                {/* Footer */}
                <DialogFooter className="mt-6 flex flex-col-reverse sm:flex-row gap-3">
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

            <ImageCropDialog
                file={coverCropFile}
                open={Boolean(coverCropFile)}
                title="Chỉnh ảnh bìa"
                cropShape="rect"
                presets={coverCropPresets}
                defaultPresetId="wide"
                confirmLabel="Lưu ảnh bìa"
                maxOutputBytes={2 * 1024 * 1024}
                uploadProgress={uploadingTarget === "cover" ? uploadProgress : null}
                onCancel={() => setCoverCropFile(null)}
                onConfirm={handleCoverCropConfirm}
            />
        </Dialog>
    );
}
