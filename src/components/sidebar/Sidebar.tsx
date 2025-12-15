// src/components/sidebar/Sidebar.tsx

import {
  Building2,
  MessageCircle,
  BookOpen,
  Bot,
  Workflow,
  Megaphone,
  PhoneCall,
  HelpCircle,
} from "lucide-react";

import { SidebarLink } from "./SidebarLink";

export function Sidebar({ forceWhite = false }: { forceWhite?: boolean }) {
  return (
    <aside
      className={`
        flex h-full w-60 flex-col border-r px-4 py-5 transition-colors duration-300
        ${forceWhite ? "bg-white border-slate-200" : "bg-slate-950/90 border-white/5"}
        text-slate-900 dark:text-slate-100
      `}
    >
      {/* ----------------------------- Brand ----------------------------- */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/25 text-accent">
          <Building2 size={20} />
        </div>
        <div>
          <p className="text-sm font-semibold">Techwheels AI</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Dealership cockpit
          </p>
        </div>
      </div>

      {/* ----------------------------- Navigation ----------------------------- */}
      <nav className="flex flex-1 flex-col gap-1 text-sm">
        <SidebarLink to="/" icon={MessageCircle} label="Chats" />
        <SidebarLink to="/knowledge" icon={BookOpen} label="Knowledge Base" />
        <SidebarLink to="/bot" icon={Bot} label="Bot Personality" />
        <SidebarLink to="/workflows" icon={Workflow} label="Workflows" />
        <SidebarLink to="/campaigns" icon={Megaphone} label="Campaigns" />

        {/* ----------------------------- Settings Section ----------------------------- */}
        <div className="mt-4 border-t pt-3 text-xs uppercase tracking-wide text-slate-500 dark:border-white/10 dark:text-slate-500">
          Settings
        </div>

        <SidebarLink
          to="/settings/whatsapp"
          icon={PhoneCall}
          label="WhatsApp Settings"
        />

        <SidebarLink to="/settings/sub-orgs" icon={Building2} label="Divisions" />
        <SidebarLink to="/unanswered" icon={HelpCircle} label="Unanswered" />
      </nav>
    </aside>
  );
}
