///src/layouts/AppLayout.tsx

import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "../components/sidebar/Sidebar";
import { Topbar } from "../components/common/Topbar";
import { useThemeStore } from "../state/useThemeStore";

export function AppLayout() {
  const { theme, initializeTheme } = useThemeStore();

  useEffect(() => {
    initializeTheme();
  }, [initializeTheme]);

  return (
    <div
      className={`
        flex h-screen w-full
        ${theme === "dark" ? "bg-slate-950 text-white" : "bg-white text-slate-900"}
      `}
    >
      {/* SIDEBAR */}
      <Sidebar forceWhite={theme !== "dark"} />

      {/* MAIN AREA */}
      <div className="flex flex-1 flex-col overflow-hidden bg-white dark:bg-slate-950">
        <Topbar />

        {/* 👇 THIS IS THE IMPORTANT PART */}
        <main className="flex-1 overflow-hidden bg-white dark:bg-slate-900">
          <div className="h-full w-full bg-white px-6 py-6 dark:bg-transparent">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}