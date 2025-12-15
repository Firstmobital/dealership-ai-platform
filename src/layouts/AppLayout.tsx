// src/layouts/AppLayout.tsx

import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "../components/sidebar/Sidebar";
import { Topbar } from "../components/common/Topbar";
import { useThemeStore } from "../state/useThemeStore";

export function AppLayout() {
  const { theme, initializeTheme } = useThemeStore();

  /**
   * Ensure correct <html> theme class is applied
   */
  useEffect(() => {
    initializeTheme();
  }, [initializeTheme]);

  return (
    <div
      className={`
        flex h-screen w-full transition-colors duration-300
        ${theme === "dark" ? "bg-slate-950 text-white" : "bg-white text-slate-900"}
      `}
    >
      {/* --------------------------------------------------------------- */}
      {/* SIDEBAR (force white in light mode)                            */}
      {/* --------------------------------------------------------------- */}
      <Sidebar
        forceWhite={theme === "light"} // NEW PROP (optional)
      />

      {/* --------------------------------------------------------------- */}
      {/* RIGHT SIDE PANEL                                               */}
      {/* --------------------------------------------------------------- */}
      <div className="flex flex-1 flex-col overflow-hidden">

        {/* ---------------------------- TOPBAR ---------------------------- */}
        <Topbar />

        {/* -------------------------- MAIN CONTENT ------------------------ */}
        <main
          className={`
            flex-1 overflow-hidden transition-colors duration-300
            ${theme === "dark" ? "bg-slate-900/40" : "bg-slate-50"}
          `}
        >
          {/* Allow modules to manage their internal scroll */}
          <div className="h-full w-full px-6 py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
