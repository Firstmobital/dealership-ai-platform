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
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6 shadow-sm 
                       dark:border-white/10 dark:bg-slate-900/60 backdrop-blur">
      {/* LEFT SIDE: ORG + DIVISION */}
      <div className="flex items-center gap-6">
        <OrganizationSwitcher />
        <SubOrgSwitcher />
      </div>

      {/* RIGHT SIDE: THEME + USER INFO */}
      <div className="flex items-center gap-4">

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm 
                     dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
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

        {/* User Info */}
        <div className="flex flex-col items-end">
          <p className="text-sm font-medium text-slate-800 dark:text-white">
            {displayName}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Dealership AI Admin
          </p>
        </div>

        {/* Sign Out */}
        <button
          onClick={() => signOut().catch(console.error)}
          className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm 
                     hover:border-accent hover:text-accent 
                     dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-accent"
        >
          <LogOut size={14} />
          Logout
        </button>
      </div>
    </header>
  );
}
