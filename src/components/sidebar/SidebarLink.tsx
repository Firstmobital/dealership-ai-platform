// src/components/sidebar/SidebarLink.tsx

import { NavLink } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

export function SidebarLink({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition",
          isActive
            ? "bg-blue-50 text-blue-700 font-medium before:absolute before:left-0 before:top-0 before:h-full before:w-1 before:bg-blue-600"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
        ].join(" ")
      }
    >
      <Icon size={18} />
      <span>{label}</span>
    </NavLink>
  );
}
