// src/components/sidebar/Sidebar.tsx
import {
  Building2,
  MessageCircle,
  BookOpen,
  Bot,
  Workflow,
  Megaphone,
  Settings,
  PhoneCall,
  HelpCircle,
} from "lucide-react";

import { SidebarLink } from "./SidebarLink";

export function Sidebar() {
  return (
    <aside className="flex h-full w-60 flex-col border-r border-slate-200 bg-white px-4 py-5 dark:border-white/5 dark:bg-slate-950/90">
      {/* ----------------------------- Brand ----------------------------- */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/20 text-accent">
          <Building2 size={20} />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            Techwheels AI
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Dealership cockpit
          </p>
        </div>
      </div>

      {/* ----------------------------- Main Navigation ----------------------------- */}
      <nav className="flex flex-1 flex-col gap-1 text-sm text-slate-700 dark:text-slate-100">
        <SidebarLink to="/" icon={MessageCircle} label="Chats" />
        <SidebarLink to="/knowledge" icon={BookOpen} label="Knowledge Base" />
        <SidebarLink to="/bot" icon={Bot} label="Bot Personality" />
        <SidebarLink to="/workflows" icon={Workflow} label="Workflows" />
        <SidebarLink to="/campaigns" icon={Megaphone} label="Campaigns" />

        {/* ----------------------------- Settings Section ----------------------------- */}
        <div className="mt-4 border-t border-slate-200 pt-3 text-xs uppercase tracking-wide text-slate-500 dark:border-white/5 dark:text-slate-500">
          Settings
        </div>

        {/* 🔥 Removed: Org Settings (unused)
        <SidebarLink to="/settings" icon={Settings} label="Org Settings" />
        */}

        <SidebarLink
          to="/settings/whatsapp"
          icon={PhoneCall}
          label="WhatsApp Settings"
        />

        {/* Divisions Manager */}
        <SidebarLink
          to="/settings/sub-orgs"
          icon={Building2}
          label="Divisions"
        />

        <SidebarLink to="/unanswered" icon={HelpCircle} label="Unanswered" />
      </nav>

      {/* (Optional) Footer / version could go here later */}
    </aside>
  );
}
