import {
  Building2,
  MessageCircle,
  BookOpen,
  Bot,
  Workflow,
  Megaphone,
  Settings,
  PhoneCall
} from 'lucide-react';
import { SidebarLink } from './SidebarLink';

export function Sidebar() {
  return (
    <aside className="flex h-full w-64 flex-col bg-slate-950/80 p-4 backdrop-blur">
      <div className="mb-6 flex items-center gap-3 text-lg font-semibold text-white">
        <Building2 className="text-accent" />
        <span>Joyz Dealership AI</span>
      </div>
      <nav className="flex flex-1 flex-col gap-2">
        <SidebarLink to="/chats" icon={MessageCircle} label="Chats" />
        <SidebarLink to="/knowledge-base" icon={BookOpen} label="Knowledge Base" />
        <SidebarLink to="/bot" icon={Bot} label="Bot Personality" />
        <SidebarLink to="/workflows" icon={Workflow} label="Workflows" />
        <SidebarLink to="/campaigns" icon={Megaphone} label="Campaigns" />
        <SidebarLink to="/settings" icon={Settings} label="Settings" />
        <SidebarLink
          to="/settings/whatsapp"
          icon={PhoneCall}
          label="WhatsApp Settings"
        />
      </nav>
    </aside>
  );
}
