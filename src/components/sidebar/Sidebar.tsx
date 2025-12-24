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
  Database,
  BarChart3,
  FileText,
  Sparkles,
} from "lucide-react";

import { SidebarLink } from "./SidebarLink";

export function Sidebar() {
  return (
    <aside className="flex h-full w-60 flex-col border-r border-slate-200 bg-white px-4 py-5">
      {/* Brand */}
      <div className="mb-6 flex items-center gap-3 px-1">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
          <Building2 size={20} />
        </div>

        <div className="leading-tight">
          <p className="text-sm font-semibold text-slate-900">
            Techwheels AI
          </p>
          <p className="text-xs text-slate-500">
            Dealership cockpit
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 text-sm">
        <SidebarLink to="/" icon={MessageCircle} label="Chats" />
        <SidebarLink to="/database" icon={Database} label="Database" />
        <SidebarLink to="/knowledge" icon={BookOpen} label="Knowledge Base" />
        <SidebarLink to="/bot" icon={Bot} label="Bot Personality" />
        <SidebarLink to="/workflows" icon={Workflow} label="Workflows" />
        <SidebarLink to="/campaigns" icon={Megaphone} label="Campaigns" />
        <SidebarLink to="/analytics" icon={BarChart3} label="Analytics" />
        <SidebarLink to="/settings/whatsapp-templates" icon={FileText} label="WhatsApp Templates"/>


        <div className="mt-4 border-t border-slate-200 pt-3 text-xs uppercase tracking-wide text-slate-500">
          Settings
        </div>

        <SidebarLink
          to="/settings/whatsapp"
          icon={PhoneCall}
          label="WhatsApp Settings"
        />
        <SidebarLink
          to="/settings/sub-orgs"
          icon={Building2}
          label="Divisions"
        />
        <SidebarLink to="/settings/ai-config" icon={Sparkles} label="AI Configuration" />
        
        <SidebarLink
          to="/unanswered"
          icon={HelpCircle}
          label="Unanswered"
        />
      </nav>
    </aside>
  );
}
