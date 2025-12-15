// src/state/useThemeStore.ts
import { create } from "zustand";

type Theme = "light" | "dark";

type ThemeState = {
  theme: Theme;
  initializeTheme: () => void;
  toggleTheme: () => void;
};

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: "light",

  initializeTheme: () => {
    // 1) Read stored preference
    const stored =
      (typeof window !== "undefined" &&
        (localStorage.getItem("theme") as Theme | null)) || null;

    // 2) Or use system preference
    const prefersDark =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;

      const theme: Theme = stored === "dark" ? "dark" : "light";

    // Apply to <html>
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", theme === "dark");
    }

    set({ theme });
  },

  toggleTheme: () => {
    const current = get().theme;
    const next: Theme = current === "light" ? "dark" : "light";

    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", next === "dark");
    }

    if (typeof window !== "undefined") {
      localStorage.setItem("theme", next);
    }

    set({ theme: next });
  },
}));
