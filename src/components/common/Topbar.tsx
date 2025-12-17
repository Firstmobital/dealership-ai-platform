// src/components/common/Topbar.tsx

import { LogOut } from "lucide-react";
import { OrganizationSwitcher } from "./OrganizationSwitcher";
import { SubOrgSwitcher } from "../topbar/SubOrgSwitcher";
import { useAuthStore } from "../../state/useAuthStore";

export function Topbar() {
  const { user, signOut } = useAuthStore();

  const displayName = user?.email ?? "Guest Agent";

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
      {/* LEFT — ORG + SUBORG */}
      <div className="flex items-center gap-4">
        <OrganizationSwitcher />
        <SubOrgSwitcher />
      </div>

      {/* RIGHT — USER + LOGOUT */}
      <div className="flex items-center gap-6">
        {/* USER INFO */}
        <div className="flex flex-col items-end leading-tight">
          <p className="text-sm font-medium text-slate-900">
            {displayName}
          </p>
          <p className="text-xs text-slate-500">
            Dealership AI Admin
          </p>
        </div>

        {/* SIGN OUT */}
        <button
          onClick={() => signOut().catch(console.error)}
          className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
        >
          <LogOut size={14} />
          Logout
        </button>
      </div>
    </header>
  );
}
