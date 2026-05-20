import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Cropper, { type Area, type MediaSize, type Point } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import { Check, Loader2, Minus, Plus, RotateCcw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  drawCroppedImageToCanvas,
  getCroppedImageFile,
  type CropOutputOptions,
} from "@/lib/imageCrop";

export interface CropPreset {
  id: string;
  label: string;
  aspect: number | "source";
  outputWidth?: number;
  outputHeight?: number;
  maxDimension?: number;
}

interface ImageCropDialogProps {
  file: File | null;
  open: boolean;
  title: string;
  cropShape?: "rect" | "round";
  presets: CropPreset[];
  defaultPresetId?: string;
  confirmLabel?: string;
  outputMimeType?: string;
  outputQuality?: number;
  maxOutputBytes?: number;
  uploadProgress?: number | null;
  onCancel: () => void;
  onConfirm: (file: File) => Promise<void> | void;
}

const fallbackPreset: CropPreset = {
  id: "source",
  label: "Gốc",
  aspect: "source",
  maxDimension: 1920,
};

function clampPercent(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function ImageCropDialog({
  file,
  open,
  title,
  cropShape = "rect",
  presets,
  defaultPresetId,
  confirmLabel = "Xác nhận",
  outputMimeType = "image/jpeg",
  outputQuality = 0.88,
  maxOutputBytes,
  uploadProgress,
  onCancel,
  onConfirm,
}: ImageCropDialogProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [naturalSize, setNaturalSize] = useState({ width: 1, height: 1 });
  const [selectedPresetId, setSelectedPresetId] = useState(defaultPresetId ?? presets[0]?.id ?? fallbackPreset.id);
  const [processing, setProcessing] = useState(false);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  const activePresets = useMemo(() => (presets.length > 0 ? presets : [fallbackPreset]), [presets]);
  const selectedPreset = activePresets.find((preset) => preset.id === selectedPresetId) ?? activePresets[0] ?? fallbackPreset;
  const naturalAspect = naturalSize.width / naturalSize.height || 1;
  const aspect = selectedPreset.aspect === "source" ? naturalAspect : selectedPreset.aspect;
  const busy = processing || uploadProgress !== null && uploadProgress !== undefined;
  const progress = clampPercent(uploadProgress);

  useEffect(() => {
    setSelectedPresetId(defaultPresetId ?? activePresets[0]?.id ?? fallbackPreset.id);
  }, [defaultPresetId, activePresets]);

  useEffect(() => {
    if (!file || !open) {
      setImageSrc(null);
      imageRef.current = null;
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      setNaturalSize({
        width: image.naturalWidth || 1,
        height: image.naturalHeight || 1,
      });
    };
    image.src = objectUrl;

    setImageSrc(objectUrl);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file, open]);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !croppedAreaPixels) return;

    drawCroppedImageToCanvas(image, croppedAreaPixels, canvas, {
      outputWidth: selectedPreset.outputWidth ? Math.min(selectedPreset.outputWidth, 320) : undefined,
      outputHeight: selectedPreset.outputHeight ? Math.min(selectedPreset.outputHeight, 320) : undefined,
      maxDimension: 320,
    });
  }, [croppedAreaPixels, selectedPreset]);

  const onCropAreaChange = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const onMediaLoaded = useCallback((mediaSize: MediaSize) => {
    setNaturalSize({
      width: mediaSize.naturalWidth || 1,
      height: mediaSize.naturalHeight || 1,
    });
  }, []);

  const outputOptions = useMemo<CropOutputOptions>(() => ({
    outputWidth: selectedPreset.outputWidth,
    outputHeight: selectedPreset.outputHeight,
    maxDimension: selectedPreset.maxDimension,
    mimeType: outputMimeType,
    quality: outputQuality,
    maxBytes: maxOutputBytes,
  }), [maxOutputBytes, outputMimeType, outputQuality, selectedPreset]);

  const handleConfirm = async () => {
    if (!file || !imageSrc || !croppedAreaPixels || busy) return;

    try {
      setProcessing(true);
      const croppedFile = await getCroppedImageFile(imageSrc, file, croppedAreaPixels, outputOptions);
      await onConfirm(croppedFile);
    } finally {
      setProcessing(false);
    }
  };

  const resetCrop = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

  const showAspectControls = activePresets.length > 1;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !busy) onCancel();
      }}
    >
      <DialogContent
        showCloseButton={!busy}
        className="z-[260] w-[calc(100vw-1rem)] max-w-[780px] gap-0 overflow-hidden rounded-2xl border-border/70 p-0 shadow-2xl sm:w-full"
      >
        <DialogHeader className="border-b border-border/60 px-4 py-3 sm:px-5">
          <DialogTitle className="text-base font-semibold sm:text-lg">{title}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-0 bg-card md:grid-cols-[minmax(0,1fr)_190px]">
          <div className="relative h-[54vh] min-h-[320px] bg-black sm:h-[500px]">
            {imageSrc && (
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={aspect}
                cropShape={cropShape}
                onCropChange={setCrop}
                onCropAreaChange={onCropAreaChange}
                onCropComplete={onCropAreaChange}
                onZoomChange={setZoom}
                onMediaLoaded={onMediaLoaded}
                showGrid={cropShape !== "round"}
                objectFit="contain"
                classes={{
                  containerClassName: "image-cropper-container",
                }}
              />
            )}
          </div>

          <div className="flex flex-col gap-4 border-t border-border/60 p-4 md:border-l md:border-t-0">
            <div className="flex items-center justify-between gap-3 md:block">
              <div className="text-sm font-medium text-foreground">Preview</div>
              <div
                className={cn(
                  "relative h-20 w-20 overflow-hidden border border-border/70 bg-muted shadow-sm md:mt-3 md:h-32 md:w-32",
                  cropShape === "round" ? "rounded-full" : "rounded-lg",
                )}
              >
                <canvas ref={previewCanvasRef} className="h-full w-full object-cover" />
              </div>
            </div>

            {showAspectControls && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-foreground">Tỉ lệ</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {activePresets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setSelectedPresetId(preset.id);
                        resetCrop();
                      }}
                      disabled={busy}
                      className={cn(
                        "h-9 rounded-lg border px-2 text-sm font-medium transition-colors",
                        selectedPreset.id === preset.id
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border/70 bg-background hover:bg-muted",
                      )}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Zoom</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={resetCrop}
                  disabled={busy}
                  title="Đặt lại"
                >
                  <RotateCcw className="size-3.5" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Minus className="size-4 text-muted-foreground" />
                <input
                  type="range"
                  min={1}
                  max={4}
                  step={0.01}
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                  disabled={busy}
                  aria-label="Zoom ảnh"
                  className="h-2 flex-1 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-60"
                />
                <Plus className="size-4 text-muted-foreground" />
              </div>
            </div>

            {(processing || progress !== null) && (
              <div className="space-y-2 rounded-lg border border-border/70 bg-background p-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{progress === null ? "Đang xử lý ảnh" : "Đang tải lên"}</span>
                  {progress !== null && <span>{progress}%</span>}
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full bg-primary transition-all",
                      progress === null && "w-1/2 animate-pulse",
                    )}
                    style={progress !== null ? { width: `${progress}%` } : undefined}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="border-t border-border/60 px-4 py-3 sm:px-5">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Hủy
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={busy || !croppedAreaPixels}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
