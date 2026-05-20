import type { Area } from "react-easy-crop";
import { formatBytes } from "@/lib/utils";

export const DEFAULT_MAX_SOURCE_IMAGE_BYTES = 15 * 1024 * 1024;
export const DEFAULT_MAX_OUTPUT_IMAGE_BYTES = 5 * 1024 * 1024;

export interface ImageValidationOptions {
  maxBytes?: number;
}

export interface CropOutputOptions {
  outputWidth?: number;
  outputHeight?: number;
  maxDimension?: number;
  mimeType?: string;
  quality?: number;
  maxBytes?: number;
  suffix?: string;
}

export function validateImageFile(file: File, options: ImageValidationOptions = {}) {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_SOURCE_IMAGE_BYTES;

  if (!file.type.startsWith("image/")) {
    return "Vui lòng chọn tệp hình ảnh hợp lệ.";
  }

  if (file.size > maxBytes) {
    return `Ảnh quá lớn. Kích thước tối đa là ${formatBytes(maxBytes)}.`;
  }

  return null;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Không thể đọc ảnh."));
    image.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Không thể xử lý ảnh."));
      },
      mimeType,
      quality,
    );
  });
}

function resolveOutputSize(crop: Area, options: CropOutputOptions) {
  if (options.outputWidth && options.outputHeight) {
    return {
      width: Math.round(options.outputWidth),
      height: Math.round(options.outputHeight),
    };
  }

  const maxDimension = options.maxDimension ?? 1920;
  const largestSide = Math.max(crop.width, crop.height);
  const scale = largestSide > maxDimension ? maxDimension / largestSide : 1;

  return {
    width: Math.max(1, Math.round(crop.width * scale)),
    height: Math.max(1, Math.round(crop.height * scale)),
  };
}

function getOutputName(originalName: string, mimeType: string, suffix = "cropped") {
  const extension = mimeType === "image/webp" ? "webp" : "jpg";
  const baseName = originalName.replace(/\.[^/.]+$/, "") || "image";
  return `${baseName}-${suffix}.${extension}`;
}

export function drawCroppedImageToCanvas(
  image: HTMLImageElement,
  crop: Area,
  canvas: HTMLCanvasElement,
  options: CropOutputOptions = {},
) {
  const { width, height } = resolveOutputSize(crop, options);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = width;
  canvas.height = height;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    width,
    height,
  );
}

export async function getCroppedImageFile(
  imageSrc: string,
  originalFile: File,
  crop: Area,
  options: CropOutputOptions = {},
) {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  const mimeType = options.mimeType ?? "image/jpeg";
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_OUTPUT_IMAGE_BYTES;
  const startingQuality = options.quality ?? 0.88;
  const qualitySteps = [
    startingQuality,
    0.84,
    0.78,
    0.72,
    0.66,
    0.6,
  ].filter((quality, index, values) => quality > 0 && values.indexOf(quality) === index);

  drawCroppedImageToCanvas(image, crop, canvas, options);

  let lastBlob: Blob | null = null;
  for (const quality of qualitySteps) {
    const blob = await canvasToBlob(canvas, mimeType, quality);
    lastBlob = blob;
    if (blob.size <= maxBytes) {
      return new File([blob], getOutputName(originalFile.name, mimeType, options.suffix), {
        type: mimeType,
        lastModified: Date.now(),
      });
    }
  }

  if (!lastBlob) {
    throw new Error("Không thể xử lý ảnh.");
  }

  return new File([lastBlob], getOutputName(originalFile.name, mimeType, options.suffix), {
    type: mimeType,
    lastModified: Date.now(),
  });
}
