// src/layouts/AppLayout.tsx

import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "../components/sidebar/Sidebar";
import { Topbar } from "../components/common/Topbar";
import { useThemeStore } from "../state/useThemeStore";

export function AppLayout() {
  const { theme, initializeTheme } = useThemeStore();

  // Ensure correct theme class on <html>
  useEffect(() => {
    initializeTheme();
  }, [initializeTheme]);

  return (
    <div
      className={`flex h-screen w-full transition-colors duration-300 ${
        theme === "dark"
          ? "bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white"
          : "bg-white text-slate-900"
      }`}
    >
      {/* Sidebar (dark/light mode handled inside component) */}
      <Sidebar />

      <div className="flex flex-1 flex-col overflow-hidden">

        {/* Topbar stays fixed and theme-aware */}
        <Topbar />

        {/* MAIN CONTENT AREA */}
        <main
          className={`
            flex-1 overflow-hidden transition-colors duration-300
            ${
              theme === "dark"
                ? "bg-slate-900/40"
                : "bg-white"
            }
          `}
        >
          <div className="h-full w-full px-6 py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
