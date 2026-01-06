// src/components/common/Topbar.tsx

import { LogOut } from "lucide-react";
import { OrganizationSwitcher } from "./OrganizationSwitcher";
import { useAuthStore } from "../../state/useAuthStore";

export function Topbar() {
  const { user, signOut } = useAuthStore();

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
      {/* LEFT */}
      <div className="flex items-center gap-6">
        <OrganizationSwitcher />
      </div>

      {/* RIGHT */}
      <div className="flex items-center gap-4">
        <div className="text-right leading-tight">
          <p className="text-sm font-medium text-slate-900">
            {user?.email ?? "Agent"}
          </p>
          <p className="text-xs text-slate-500">
            Dealership AI Admin
          </p>
        </div>

        <button
          onClick={() => signOut().catch(console.error)}
          className="flex items-center gap-1 rounded-md px-2.5 py-1.5
                     text-xs font-medium text-slate-600 hover:bg-slate-100"
        >
          <LogOut size={14} />
          Logout
        </button>
      </div>
    </header>
  );
}
