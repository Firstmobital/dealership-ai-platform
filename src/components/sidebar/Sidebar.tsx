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
  Wallet,
  ThumbsUp,
} from "lucide-react";

import { SidebarLink } from "./SidebarLink";
import { useWalletStore } from "../../state/useWalletStore";

export function Sidebar() {
  // 💰 Wallet state (single source of truth)
  const { walletStatus } = useWalletStore();

  // Badge based on derived wallet status
  const walletBadge =
    walletStatus === "critical" ? (
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
        CRITICAL
      </span>
    ) : walletStatus === "low" ? (
      <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-semibold text-yellow-700">
        LOW
      </span>
    ) : null;

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

        {/* =========================
            CAMPAIGNS & ENGAGEMENT
        ========================= */}
        <SidebarLink to="/campaigns" icon={Megaphone} label="Campaigns" />
        <SidebarLink
          to="/psf"
          icon={ThumbsUp}
          label="Post Service Feedback"
        />

        <SidebarLink to="/analytics" icon={BarChart3} label="Analytics" />

        <SidebarLink
          to="/settings/whatsapp-templates"
          icon={FileText}
          label="WhatsApp Templates"
        />

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

        <SidebarLink
          to="/settings/ai-config"
          icon={Sparkles}
          label="AI Configuration"
        />

        {/* 💰 Wallet — visible to all users in Phase 5.x */}
        <SidebarLink
          to="/settings/wallet"
          icon={Wallet}
          label={
            <div className="flex items-center gap-2">
              <span>Wallet</span>
              {walletBadge}
            </div>
          }
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
