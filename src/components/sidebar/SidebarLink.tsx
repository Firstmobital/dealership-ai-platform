import { NavLink } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import clsx from 'classnames';

type SidebarLinkProps = {
  to: string;
  icon: LucideIcon;
  label: string;
};

export function SidebarLink({ to, icon: Icon, label }: SidebarLinkProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        clsx(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isActive ? 'bg-accent/20 text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'
        )
      }
    >
      <Icon size={18} />
      <span>{label}</span>
    </NavLink>
  );
}

