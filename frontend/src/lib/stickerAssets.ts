const CLOUDINARY_CLOUD_NAME = "df1iezypb";
const CLOUDINARY_IMAGE_BASE_URL = `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload`;
const STICKER_ASSET_VERSION = import.meta.env.VITE_STICKER_ASSET_VERSION ?? "2026-05-18";

export type StickerSet = {
  id: string;
  name: string;
  iconUrl: string;
  stickers: string[];
};

type StickerSetConfig = {
  id: string;
  name: string;
  folder: string;
  prefix: string;
  count: number;
};

type StickerCacheEntry = {
  status: "loading" | "loaded" | "error";
  src?: string;
  promise?: Promise<string>;
};

const DEFAULT_STICKER_SET_CONFIGS: StickerSetConfig[] = [
  { id: "bu-mat-ngao", name: "Bu Mat Ngao", folder: "bu_mat_ngao", prefix: "Bu", count: 9 },
  { id: "zapy-do-tri", name: "Zapy Do Tri", folder: "zapy_do_tri", prefix: "zapy", count: 9 },
  { id: "tonton", name: "Tonton", folder: "tonton", prefix: "tonton", count: 9 },
  { id: "meo-meo", name: "Meo Meo", folder: "meo_meo", prefix: "meomeo", count: 9 },
  {
    id: "hand-drawn-emotes",
    name: "Hand Drawn Emotes",
    folder: "hand-drawn-emotes-elements-collection",
    prefix: "handdrawn",
    count: 9,
  },
  { id: "sticker-1", name: "Sticker 1", folder: "sticker1", prefix: "sticker1", count: 9 },
  { id: "sticker-2", name: "Sticker 2", folder: "sticker2", prefix: "sticker2", count: 9 },
  { id: "sticker-3", name: "Sticker 3", folder: "sticker3", prefix: "sticker3", count: 9 },
  { id: "sticker-5", name: "Sticker 5", folder: "sticker5", prefix: "sticker5", count: 22 },
  { id: "sticker-6", name: "Sticker 6", folder: "sticker6", prefix: "sticker6", count: 15 },
  { id: "sticker-9", name: "Sticker 9", folder: "sticker9", prefix: "sticker9", count: 40 },
  { id: "sticker-10", name: "Sticker 10", folder: "sticker10", prefix: "sticker10", count: 16 },
  { id: "sticker-12", name: "Sticker 12", folder: "sticker12", prefix: "sticker12", count: 9 },
];

const stickerImageCache = new Map<string, StickerCacheEntry>();

function getStickerAssetUrl(folder: string, fileName: string) {
  return `${CLOUDINARY_IMAGE_BASE_URL}/stickers/${folder}/${fileName}.png?v=${STICKER_ASSET_VERSION}`;
}

function buildStickerSet(config: StickerSetConfig): StickerSet {
  return {
    id: config.id,
    name: config.name,
    iconUrl: getStickerAssetUrl(config.folder, "icon"),
    stickers: Array.from(
      { length: config.count },
      (_, index) => getStickerAssetUrl(config.folder, `${config.prefix}${index + 1}`),
    ),
  };
}

export const STICKER_SETS = DEFAULT_STICKER_SET_CONFIGS.map(buildStickerSet);

export function getCachedStickerImageSrc(url: string) {
  const cached = stickerImageCache.get(url);
  return cached?.status === "loaded" ? cached.src ?? null : null;
}

export function getCachedStickerImageStatus(url: string) {
  return stickerImageCache.get(url)?.status ?? "idle";
}

export function loadStickerImage(url: string, options?: { revalidate?: boolean }) {
  const cached = stickerImageCache.get(url);
  if (cached?.status === "loaded" && cached.src && !options?.revalidate) {
    return Promise.resolve(cached.src);
  }
  if (cached?.status === "loading" && cached.promise) {
    return cached.promise;
  }
  if (cached?.status === "error" && !options?.revalidate) {
    return Promise.reject(new Error("Sticker image failed to load."));
  }

  const promise = fetch(url, { cache: "no-cache" })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Sticker image returned ${response.status}.`);
      }
      return response.blob();
    })
    .then((blob) => {
      const objectUrl = URL.createObjectURL(blob);
      stickerImageCache.set(url, { status: "loaded", src: objectUrl });
      return objectUrl;
    })
    .catch((error) => {
      stickerImageCache.set(url, { status: "error" });
      throw error;
    });

  stickerImageCache.set(url, { status: "loading", promise });
  return promise;
}

export function preloadStickerUrls(urls: string[]) {
  urls.forEach((url) => {
    if (stickerImageCache.has(url)) return;
    loadStickerImage(url).catch(() => undefined);
  });
}

export function preloadStickerSet(set: StickerSet) {
  preloadStickerUrls([set.iconUrl, ...set.stickers]);
}
