import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";

import { AppLayout } from "./layouts/AppLayout";
import { ChatsModule } from "./modules/chats/ChatsModule";
import { KnowledgeBaseModule } from "./modules/knowledge-base/KnowledgeBaseModule";
import { BotPersonalityModule } from "./modules/bot-personality/BotPersonalityModule";
import { WorkflowModule } from "./modules/workflows/WorkflowModule";
import { CampaignsModule } from "./modules/campaigns/CampaignsModule";
import { SettingsModule } from "./modules/dashboard/SettingsModule";
import { WhatsappSettingsModule } from "./modules/settings/WhatsappSettingsModule";
import { UnansweredQuestionsModule } from "./modules/unanswered/UnansweredQuestionsModule";

import { LoginPage } from "./modules/auth/LoginPage";
import { SignupPage } from "./modules/auth/SignupPage";
import { ResetPasswordPage } from "./modules/auth/ResetPasswordPage";
import { UpdatePasswordPage } from "./modules/auth/UpdatePasswordPage";
import { useAuthStore } from "./state/useAuthStore";


// ---------------------------------------------------------------------------
// PROTECTED WRAPPER — BLOCKS UNAUTHENTICATED USERS
// ---------------------------------------------------------------------------
function ProtectedAppLayout() {
  const { session, initialize, loading } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    initialize().catch(console.error);
  }, [initialize]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
        <div className="text-sm text-slate-400">Loading dashboard…</div>
      </div>
    );
  }

  if (!session) {
    return (
      <Navigate
        to="/auth/login"
        state={{ from: location }}
        replace
      />
    );
  }

  return <AppLayout />;
}


// ---------------------------------------------------------------------------
// MAIN ROUTING
// ---------------------------------------------------------------------------
function App() {
  return (
    <Routes>

      {/* -------------------------- Public Auth Routes ------------------------ */}
      <Route path="/auth">
        <Route index element={<Navigate to="/auth/login" replace />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="signup" element={<SignupPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route path="update-password" element={<UpdatePasswordPage />} />
      </Route>

      {/* -------------------------- Protected Dashboard ----------------------- */}
      <Route path="/" element={<ProtectedAppLayout />}>

        {/* Default -> chats */}
        <Route index element={<Navigate to="/chats" replace />} />

        <Route path="chats" element={<ChatsModule />} />
        <Route path="knowledge-base" element={<KnowledgeBaseModule />} />
        <Route path="bot" element={<BotPersonalityModule />} />
        <Route path="workflows" element={<WorkflowModule />} />
        <Route path="campaigns" element={<CampaignsModule />} />

        {/* ⭐ FIXED: Relative route */}
        <Route path="unanswered" element={<UnansweredQuestionsModule />} />

        {/* Settings */}
        <Route path="settings" element={<SettingsModule />} />
        <Route path="settings/whatsapp" element={<WhatsappSettingsModule />} />
      </Route>

      {/* -------------------------- Fallback Redirect ------------------------- */}
      <Route path="*" element={<Navigate to="/" replace />} />

    </Routes>
  );
}

export default App;
