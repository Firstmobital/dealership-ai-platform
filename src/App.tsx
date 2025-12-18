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
import { SubOrganizationsPanel } from "./modules/settings/SubOrganizationsPanel";

import { LoginPage } from "./modules/auth/LoginPage";
import { SignupPage } from "./modules/auth/SignupPage";
import { ResetPasswordPage } from "./modules/auth/ResetPasswordPage";
import { UpdatePasswordPage } from "./modules/auth/UpdatePasswordPage";

import { useAuthStore } from "./state/useAuthStore";
import { useOrganizationStore } from "./state/useOrganizationStore";
import { useChatStore } from "./state/useChatStore";

import { Toaster } from "react-hot-toast";
import DatabasePage from "./modules/database/pages/DatabasePage";
import AnalyticsPage from "./modules/analytics/pages/AnalyticsPage";


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
    currentOrganization,
    fetchOrganizations,
  } = useOrganizationStore();

  const initRealtime = useChatStore((s) => s.initRealtime);
  const fetchConversations = useChatStore((s) => s.fetchConversations);

  /**
   * 1) Load organizations after login
   */
  useEffect(() => {
    if (user) {
      fetchOrganizations().catch(console.error);
    }
  }, [user, fetchOrganizations]);

  /**
   * 2) Start realtime ONLY after organization is known
   */
  useEffect(() => {
    if (!currentOrganization?.id) return;

    initRealtime(currentOrganization.id);
    fetchConversations(currentOrganization.id);
  }, [
    currentOrganization?.id,
    initRealtime,
    fetchConversations,
  ]);

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
              <Toaster
                position="top-right"
                toastOptions={{ duration: 2500 }}
              />
              <AppLayout />
            </>
          </RequireAuth>
        }
      >
        <Route index element={<ChatsModule />} />
        <Route path="chats" element={<ChatsModule />} />
        <Route path="knowledge" element={<KnowledgeBaseModule />} />
        <Route path="bot" element={<BotPersonalityModule />} />
        <Route path="workflows" element={<WorkflowModule />} />
        <Route path="campaigns" element={<CampaignsModule />} />
        <Route path="database" element={<DatabasePage />} />
        <Route path="settings" element={<SettingsModule />} />
        <Route path="analytics" element={<AnalyticsPage />} />

        <Route
          path="settings/whatsapp"
          element={<WhatsappSettingsModule />}
        />
        <Route
          path="settings/sub-orgs"
          element={<SubOrganizationsPanel />}
        />
        <Route
          path="unanswered"
          element={<UnansweredQuestionsModule />}
        />
      </Route>

      {/* ---------------------------- Fallback ------------------------------- */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
