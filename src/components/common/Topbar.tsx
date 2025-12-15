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
        flex h-14 items-center justify-between px-6
        border-b border-slate-200
        bg-white
        transition-colors
        dark:bg-slate-900 dark:border-white/10
      "
    >
      {/* LEFT — ORG + SUBORG */}
      <div className="flex items-center gap-4">
        <OrganizationSwitcher />
        <SubOrgSwitcher />
      </div>

      {/* RIGHT — THEME + USER + LOGOUT */}
      <div className="flex items-center gap-4">
        {/* THEME SWITCH */}
        <button
          onClick={toggleTheme}
          className="
            flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium
            text-slate-800 hover:bg-slate-100
            dark:text-slate-300 dark:hover:bg-slate-800
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
        <div className="flex flex-col items-end leading-tight">
          <p className="text-sm font-medium text-slate-900 dark:text-white">
            {displayName}
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Dealership AI Admin
          </p>
        </div>

        {/* SIGN OUT */}
        <button
          onClick={() => signOut().catch(console.error)}
          className="
            flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium
            text-slate-800 hover:bg-slate-100 hover:text-slate-900
            dark:text-slate-300 dark:hover:bg-slate-800
          "
        >
          <LogOut size={14} />
          Logout
        </button>
      </div>
    </header>
  );
}
