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
import { useThemeStore } from "../../state/useThemeStore";

export function Sidebar() {
  const { theme } = useThemeStore();

  const isDark = theme === "dark";

  return (
    <aside
      className={`
        flex h-full w-60 flex-col border-r transition-colors duration-300
        ${isDark ? "border-white/10 bg-slate-950/90 text-white" : "border-gray-200 bg-white text-slate-900"}
      `}
    >
      {/* Brand Header */}
      <div className="mb-6 flex items-center gap-3 px-4">
        <div
          className={`
            flex h-9 w-9 items-center justify-center rounded-lg border
            ${isDark ? "border-white/10 bg-slate-800 text-accent" : "border-gray-200 bg-slate-100 text-accent"}
          `}
        >
          <Building2 size={20} />
        </div>

        <div>
          <p className="text-sm font-semibold">Techwheels AI</p>
          <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            Dealership cockpit
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 text-sm px-2">
        <SidebarLink to="/" icon={MessageCircle} label="Chats" />
        <SidebarLink to="/knowledge" icon={BookOpen} label="Knowledge Base" />
        <SidebarLink to="/bot" icon={Bot} label="Bot Personality" />
        <SidebarLink to="/workflows" icon={Workflow} label="Workflows" />
        <SidebarLink to="/campaigns" icon={Megaphone} label="Campaigns" />

        <div
          className={`
            mt-4 border-t pt-3 text-xs uppercase tracking-wide
            ${isDark ? "border-white/10 text-slate-500" : "border-gray-200 text-slate-400"}
          `}
        >
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

        <SidebarLink
          to="/unanswered"
          icon={HelpCircle}
          label="Unanswered"
        />
      </nav>
    </aside>
  );
}
