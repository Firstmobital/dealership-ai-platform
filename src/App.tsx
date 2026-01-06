// src/App.tsx
import { useEffect, type ReactElement } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { AppLayout } from "./layouts/AppLayout";

import { ChatsModule } from "./modules/chats/ChatsModule";
import { KnowledgeBaseModule } from "./modules/knowledge-base/KnowledgeBaseModule";
import { BotPersonalityModule } from "./modules/bot-personality/BotPersonalityModule";
import { WorkflowModule } from "./modules/workflows/WorkflowModule";
import { CampaignsModule } from "./modules/campaigns/CampaignsModule";
import { SettingsModule } from "./modules/dashboard/SettingsModule";
import { WhatsappSettingsModule } from "./modules/settings/WhatsappSettingsModule";
import { UnansweredQuestionsModule } from "./modules/unanswered/UnansweredQuestionsModule";
import { WhatsappTemplatesModule } from "./modules/settings/WhatsappTemplatesModule";
import { AIConfigurationModule } from "./modules/settings/AIConfigurationModule";

import { LoginPage } from "./modules/auth/LoginPage";
import { SignupPage } from "./modules/auth/SignupPage";
import { ResetPasswordPage } from "./modules/auth/ResetPasswordPage";
import { UpdatePasswordPage } from "./modules/auth/UpdatePasswordPage";

import { useAuthStore } from "./state/useAuthStore";
import { useOrganizationStore } from "./state/useOrganizationStore";
import { useChatStore } from "./state/useChatStore";

import { Toaster } from "react-hot-toast";
import DatabasePage from "./modules/database/pages/DatabasePage";
import { WhatsappOverviewPage } from "./modules/analytics/pages/WhatsappOverviewPage";
import WalletPage from "./pages/settings/WalletPage";

/* ================= PSF MODULE ================= */
import { PsfModule } from "./modules/psf/PsfModule";

/* -------------------------------------------------------------------------- */
/* FULL SCREEN LOADING                                                         */
/* -------------------------------------------------------------------------- */
function FullScreenLoader() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-slate-200">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        <p className="text-sm text-slate-400">
          Preparing your dealership workspace…
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* AUTH GUARD                                                                  */
/* -------------------------------------------------------------------------- */
function RequireAuth({ children }: { children: ReactElement }) {
  const { user, initialized, loading, initialize } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    if (!initialized && !loading) {
      initialize().catch(console.error);
    }
  }, [initialized, loading, initialize]);

  if (!initialized || loading) {
    return <FullScreenLoader />;
  }

  if (!user) {
    return <Navigate to="/auth/login" state={{ from: location }} replace />;
  }

  return children;
}

/* -------------------------------------------------------------------------- */
/* APP ROOT                                                                    */
/* -------------------------------------------------------------------------- */
function App() {
  const { user } = useAuthStore();

  const {
    activeOrganization,
    isBootstrapping,
    bootstrapOrganizations,
  } = useOrganizationStore();

  const initRealtime = useChatStore((s) => s.initRealtime);
  const fetchConversations = useChatStore((s) => s.fetchConversations);

  /* ---------------------------------------------------------------------- */
  /* 1) Bootstrap orgs after login (DB-driven default org)                   */
  /* ---------------------------------------------------------------------- */
  useEffect(() => {
    if (!user) return;
    bootstrapOrganizations().catch(console.error);
  }, [user, bootstrapOrganizations]);

  /* ---------------------------------------------------------------------- */
  /* 2) Start realtime ONLY after active org is known                        */
  /* ---------------------------------------------------------------------- */
  useEffect(() => {
    if (!activeOrganization?.id) return;

    initRealtime(activeOrganization.id);
    fetchConversations(activeOrganization.id);
  }, [activeOrganization?.id, initRealtime, fetchConversations]);

  /* ---------------------------------------------------------------------- */
  /* 3) Guard: if org bootstrap running, show loader                         */
  /* ---------------------------------------------------------------------- */
  if (user && isBootstrapping) {
    return <FullScreenLoader />;
  }

  /* ---------------------------------------------------------------------- */
  /* 4) Guard: user logged in but no orgs → send to settings (temporary)     */
  /*    Later we replace this with a CreateOrganization page.                */
  /* ---------------------------------------------------------------------- */
  const hasOrg = !!activeOrganization?.id;

  return (
    <Routes>
      {/* ----------------------------- Auth routes ---------------------------- */}
      <Route path="/auth/login" element={<LoginPage />} />
      <Route path="/auth/signup" element={<SignupPage />} />
      <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
      <Route path="/auth/update-password" element={<UpdatePasswordPage />} />

      {/* ------------------------ Protected application ----------------------- */}
      <Route
        path="/"
        element={
          <RequireAuth>
            <>
              <Toaster position="top-right" toastOptions={{ duration: 2500 }} />
              <AppLayout />
            </>
          </RequireAuth>
        }
      >
        {/* If logged in but no org, force user to settings for now */}
        <Route
          index
          element={hasOrg ? <ChatsModule /> : <Navigate to="/settings" replace />}
        />

        <Route
          path="chats"
          element={hasOrg ? <ChatsModule /> : <Navigate to="/settings" replace />}
        />
        <Route
          path="knowledge"
          element={
            hasOrg ? <KnowledgeBaseModule /> : <Navigate to="/settings" replace />
          }
        />
        <Route
          path="bot"
          element={
            hasOrg ? <BotPersonalityModule /> : <Navigate to="/settings" replace />
          }
        />
        <Route
          path="workflows"
          element={hasOrg ? <WorkflowModule /> : <Navigate to="/settings" replace />}
        />
        <Route
          path="campaigns"
          element={
            hasOrg ? <CampaignsModule /> : <Navigate to="/settings" replace />
          }
        />

        {/* ✅ PSF */}
        <Route path="psf" element={hasOrg ? <PsfModule /> : <Navigate to="/settings" replace />} />

        {/* ----------------------- Analytics & Data -------------------------- */}
        <Route
          path="analytics"
          element={
            hasOrg ? <WhatsappOverviewPage /> : <Navigate to="/settings" replace />
          }
        />
        <Route
          path="database"
          element={hasOrg ? <DatabasePage /> : <Navigate to="/settings" replace />}
        />

        {/* -------------------------- Settings ------------------------------- */}
        <Route path="settings" element={<SettingsModule />} />
        <Route path="settings/whatsapp" element={<WhatsappSettingsModule />} />
        <Route
          path="settings/whatsapp-templates"
          element={<WhatsappTemplatesModule />}
        />
        <Route path="settings/ai-config" element={<AIConfigurationModule />} />
        <Route path="settings/wallet" element={<WalletPage />} />

        {/* --------------------- Knowledge feedback -------------------------- */}
        <Route
          path="unanswered"
          element={
            hasOrg ? <UnansweredQuestionsModule /> : <Navigate to="/settings" replace />
          }
        />
      </Route>

      {/* ---------------------------- Fallback ------------------------------- */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
