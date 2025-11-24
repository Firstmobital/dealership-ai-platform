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
    <aside className="flex h-full w-60 flex-col border-r border-white/5 bg-slate-950/90 px-4 py-5">
      {/* Brand */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/20 text-accent">
          <Building2 size={20} />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Techwheels AI</p>
          <p className="text-xs text-slate-400">Dealership cockpit</p>
        </div>
      </div>

      {/* Main nav */}
      <nav className="flex flex-1 flex-col gap-1 text-sm">
        <SidebarLink to="/" icon={MessageCircle} label="Chats" />
        <SidebarLink to="/knowledge" icon={BookOpen} label="Knowledge Base" />
        <SidebarLink to="/bot" icon={Bot} label="Bot Personality" />
        <SidebarLink to="/workflows" icon={Workflow} label="Workflows" />
        <SidebarLink to="/campaigns" icon={Megaphone} label="Campaigns" />

        <div className="mt-4 border-t border-white/5 pt-3 text-xs uppercase tracking-wide text-slate-500">
          Settings
        </div>
        <SidebarLink to="/settings" icon={Settings} label="Org Settings" />
        <SidebarLink
          to="/settings/whatsapp"
          icon={PhoneCall}
          label="WhatsApp Settings"
        />
        <SidebarLink
          to="/unanswered"
          icon={HelpCircle}
          label="Unanswered"
        />
      </nav>
    </aside>
  );
}
