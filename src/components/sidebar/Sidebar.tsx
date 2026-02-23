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
  Users,
  Menu,
  X,
} from "lucide-react";

import { SidebarLink } from "./SidebarLink";
import { useWalletStore } from "../../state/useWalletStore";
import { useEffect, useState } from "react";
import { useOrganizationStore } from "../../state/useOrganizationStore";
import { supabase } from "../../lib/supabaseClient";
import { canAccessFullApp, ORG_ROLES } from "../../auth/orgRoles";

export function Sidebar() {
  // 💰 Wallet state (single source of truth)
  const { walletStatus } = useWalletStore();
  const { activeOrganization, currentUserRole } = useOrganizationStore();

  const [open, setOpen] = useState(false);

  const isFullApp = canAccessFullApp(currentUserRole);
  const isLeadsOnly =
    !!currentUserRole &&
    (currentUserRole === ORG_ROLES.LEAD_MANAGER ||
      currentUserRole === ORG_ROLES.TEAM_LEADER ||
      currentUserRole === ORG_ROLES.AGENT);

  // Close sidebar on route change via popstate (basic) and on resize to desktop.
  useEffect(() => {
    const onPop = () => setOpen(false);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 640) setOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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

  const Nav = (
    <>
      {/* Brand */}
      <div className="mb-6 flex items-center gap-3 px-1">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
          <Building2 size={20} />
        </div>

        <div className="leading-tight">
          <p className="text-sm font-semibold text-slate-900">Techwheels AI</p>
          <p className="text-xs text-slate-500">Dealership cockpit</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 text-sm" onClick={() => setOpen(false)}>
        {!isFullApp && isLeadsOnly ? (
          <>
            <SidebarLink to="/leads" icon={Users} label="Leads" />
          </>
        ) : (
          <>
            <SidebarLink to="/" icon={MessageCircle} label="Chats" />
            <SidebarLink to="/database" icon={Database} label="Database" />
            <SidebarLink to="/leads" icon={Users} label="Leads" />
            <SidebarLink to="/knowledge" icon={BookOpen} label="Knowledge Base" />
            <SidebarLink to="/bot" icon={Bot} label="Bot Personality" />
            <SidebarLink to="/workflows" icon={Workflow} label="Workflows" />

            <SidebarLink to="/campaigns" icon={Megaphone} label="Campaigns" />
            <SidebarLink to="/psf" icon={ThumbsUp} label="Post Service Feedback" />
            <SidebarLink to="/analytics" icon={BarChart3} label="Analytics" />

            <SidebarLink
              to="/settings/whatsapp-templates"
              icon={FileText}
              label="WhatsApp Templates"
            />

            <div className="mt-4 border-t border-slate-200 pt-3 text-xs uppercase tracking-wide text-slate-500">
              Settings
            </div>

            <SidebarLink to="/settings/whatsapp" icon={PhoneCall} label="WhatsApp Settings" />
            <SidebarLink to="/settings/ai-config" icon={Sparkles} label="AI Configuration" />

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

            <SidebarLink to="/unanswered" icon={HelpCircle} label="Unanswered" />
          </>
        )}
      </nav>
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setOpen(true)}
        className="fixed left-3 top-3 z-50 inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 sm:hidden"
        aria-label="Open menu"
      >
        <Menu size={18} />
      </button>

      {/* Mobile overlay */}
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-black/40 sm:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}

      {/* Mobile drawer */}
      <aside
        className={`fixed left-0 top-0 z-50 h-full w-72 transform border-r border-slate-200 bg-white px-4 py-5 shadow-lg transition-transform sm:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-2 flex justify-end">
          <button
            onClick={() => setOpen(false)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-slate-100"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>
        {Nav}
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden h-full w-60 flex-col border-r border-slate-200 bg-white px-4 py-5 sm:flex">
        {Nav}
      </aside>
    </>
  );
}
