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
      className={({ isActive }) => `
        group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all
        ${
          isActive
            ? // ACTIVE STATE — highlighted with accent color
              "bg-accent/15 text-accent border-l-4 border-accent"
            : // INACTIVE STATE
              "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white border-l-4 border-transparent"
        }
      `}
    >
      <Icon
        size={18}
        className={`
          transition-colors
          ${
            // ACTIVE ICON COLOR
            location.pathname === to
              ? "text-accent"
              : "text-slate-400 group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-white"
          }
        `}
      />
      <span>{label}</span>
    </NavLink>
  );
}
