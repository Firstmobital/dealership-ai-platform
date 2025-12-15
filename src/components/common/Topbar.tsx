// src/components/common/Topbar.tsx

import { Sun, Moon, LogOut } from "lucide-react";
import { OrganizationSwitcher } from "./OrganizationSwitcher";
import { SubOrgSwitcher } from "../topbar/SubOrgSwitcher";
import { useAuthStore } from "../../state/useAuthStore";
import { useThemeStore } from "../../state/useThemeStore";

export function Topbar() {
  const { user, signOut } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();

  const displayName = user?.email ?? "Guest Agent";

  return (
    <header
      className="
        flex h-16 items-center justify-between px-6 border-b transition-colors
        bg-white/90 backdrop-blur shadow-sm border-slate-200 
        dark:bg-slate-900/60 dark:border-white/10
      "
    >
      {/* LEFT — ORG + SUBORG */}
      <div className="flex items-center gap-6">
        <OrganizationSwitcher />
        <SubOrgSwitcher />
      </div>

      {/* RIGHT — THEME + USER + LOGOUT */}
      <div className="flex items-center gap-4">

        {/* THEME SWITCH */}
        <button
          onClick={toggleTheme}
          className="
            flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium 
            bg-white text-slate-700 shadow-sm border-slate-300 
            hover:border-accent hover:text-accent
            dark:bg-slate-800 dark:text-slate-200 dark:border-white/10
          "
        >
          {theme === "light" ? (
            <>
              <Moon size={14} /> Dark
            </>
          ) : (
            <>
              <Sun size={14} /> Light
            </>
          )}
        </button>

        {/* USER INFO */}
        <div className="flex flex-col items-end">
          <p className="text-sm font-medium text-slate-800 dark:text-white">
            {displayName}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Dealership AI Admin
          </p>
        </div>

        {/* SIGN OUT */}
        <button
          onClick={() => signOut().catch(console.error)}
          className="
            flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium
            bg-white text-slate-700 shadow-sm border-slate-300
            hover:border-accent hover:text-accent
            dark:bg-slate-800 dark:text-slate-200 dark:border-white/10
          "
        >
          <LogOut size={14} />
          Logout
        </button>
      </div>
    </header>
  );
}
