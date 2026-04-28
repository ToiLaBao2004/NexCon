import type { ThemeState } from "@/types/store";
import { create } from "zustand";
import { persist } from "zustand/middleware";

const applyTheme = (dark: boolean) => {
	document.documentElement.classList.toggle("dark", dark);
};

const getSystemTheme = () => {
	return window.matchMedia("(prefers-color-scheme: dark)").matches;
};

export const useThemeStore = create<ThemeState>()(
	persist(
		(set, get) => ({
			isDark: false,
			isManual: false,

			initTheme: () => {
				const { isManual, isDark } = get();

				const dark = isManual ? isDark : getSystemTheme();

				set({ isDark: dark });
				applyTheme(dark);
			},

			toggleTheme: () => {
				const newValue = !get().isDark;

				set({
					isDark: newValue,
					isManual: true,
				});

				applyTheme(newValue);
			},

			setTheme: (dark: boolean) => {
				set({
					isDark: dark,
					isManual: true,
				});

				applyTheme(dark);
			},

			useSystemTheme: () => {
				const dark = getSystemTheme();

				set({
					isDark: dark,
					isManual: false,
				});

				applyTheme(dark);
			},
		}),
		{
			name: "theme-storage",
		}
	)
);