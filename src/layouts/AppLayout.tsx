import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "../components/sidebar/Sidebar";
import { Topbar } from "../components/common/Topbar";
import { useThemeStore } from "../state/useThemeStore";

export function AppLayout() {
  const { theme, initializeTheme } = useThemeStore();

  // Ensure the correct theme class is on <html> when the app mounts
  useEffect(() => {
    initializeTheme();
  }, [initializeTheme]);

  return (
    <div
      className={`flex h-screen w-full text-slate-900 dark:text-white ${
        theme === "dark"
          ? "bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950"
          : "bg-slate-50"
      }`}
    >
      <Sidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />

        {/* Let inner modules (Chats, KB, etc.) manage their own scroll */}
        <main className="flex-1 overflow-hidden bg-slate-50 px-6 py-6 dark:bg-slate-900/40">
          <Outlet />
        </main>
      </div>
    </div>
  );
}