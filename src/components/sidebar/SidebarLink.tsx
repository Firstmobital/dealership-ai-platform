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
          "group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
          isActive
            ? "bg-slate-100 text-slate-900 font-medium dark:bg-slate-800 dark:text-white"
            : "text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white",
        ].join(" ")
      }
    >
      <Icon
        size={18}
        className={[
          "transition-colors",
          "text-slate-500 group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-200",
          "group-[.active]:text-slate-800 dark:group-[.active]:text-white",
        ].join(" ")}
      />
      <span>{label}</span>
    </NavLink>
  );
}