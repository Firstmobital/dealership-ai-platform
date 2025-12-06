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


function FullScreenLoader() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-slate-200">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        <p className="text-sm text-slate-400">Preparing your dealership workspace…</p>
      </div>
    </div>
  );
}

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
    return (
      <Navigate to="/auth/login" state={{ from: location }} replace />
    );
  }

  return children;
}

function App() {
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
            <AppLayout />
          </RequireAuth>
        }
      >
        {/* Default = Chats Inbox */}
        <Route index element={<ChatsModule />} />

        {/* Chats explicitly */}
        <Route path="chats" element={<ChatsModule />} />

        {/* Knowledge Base */}
        <Route path="knowledge" element={<KnowledgeBaseModule />} />

        {/* Bot Personality */}
        <Route path="bot" element={<BotPersonalityModule />} />

        {/* Workflows */}
        <Route path="workflows" element={<WorkflowModule />} />

        {/* Campaigns */}
        <Route path="campaigns" element={<CampaignsModule />} />

        {/* Settings Home */}
        <Route path="settings" element={<SettingsModule />} />

        {/* WhatsApp Settings */}
        <Route path="settings/whatsapp" element={<WhatsappSettingsModule />} />

        {/* Sub-Organizations (Divisions Manager) */}
        <Route path="settings/sub-orgs" element={<SubOrganizationsPanel />} />

        {/* Unanswered Questions */}
        <Route path="unanswered" element={<UnansweredQuestionsModule />} />
      </Route>

      {/* ---------------------------- Fallback 404 ---------------------------- */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
