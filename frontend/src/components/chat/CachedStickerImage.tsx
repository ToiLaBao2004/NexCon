import type { ImgHTMLAttributes } from "react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  getCachedStickerImageSrc,
  getCachedStickerImageStatus,
  loadStickerImage,
} from "@/lib/stickerAssets";

type CachedStickerImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string;
};

export default function CachedStickerImage({
  src,
  alt,
  className,
  ...props
}: CachedStickerImageProps) {
  const [displaySrc, setDisplaySrc] = useState(() => getCachedStickerImageSrc(src));
  const [failed, setFailed] = useState(() => getCachedStickerImageStatus(src) === "error");

  useEffect(() => {
    let cancelled = false;
    const cachedSrc = getCachedStickerImageSrc(src);

    setDisplaySrc(cachedSrc);
    setFailed(getCachedStickerImageStatus(src) === "error");

    loadStickerImage(src, { revalidate: true })
      .then((loadedSrc) => {
        if (!cancelled) {
          setDisplaySrc(loadedSrc);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDisplaySrc(null);
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [src]);

  if (failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={cn(
          "flex items-center justify-center rounded-md bg-muted/50 text-[10px] text-muted-foreground",
          className,
        )}
      >
        sticker
      </div>
    );
  }

  if (!displaySrc) {
    return (
      <div
        aria-hidden="true"
        className={cn("rounded-md bg-muted/40 animate-pulse", className)}
      />
    );
  }

  return (
    <img
      src={displaySrc}
      alt={alt}
      className={className}
      {...props}
    />
  );
}
