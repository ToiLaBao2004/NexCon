import { create } from "zustand";
import type { ImageViewerState } from "@/types/store";

export const useImageViewerStore = create<ImageViewerState>((set) => ({
  isOpen: false,
  image: null,

  openViewer: (image) => set({ isOpen: true, image }),
  closeViewer: () => set({ isOpen: false, image: null }),
}));
