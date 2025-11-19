import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import { ChatsModule } from './modules/chats/ChatsModule';
import { KnowledgeBaseModule } from './modules/knowledge-base/KnowledgeBaseModule';
import { BotPersonalityModule } from './modules/bot-personality/BotPersonalityModule';
import { WorkflowModule } from './modules/workflows/WorkflowModule';
import { CampaignsModule } from './modules/campaigns/CampaignsModule';
import { SettingsModule } from './modules/dashboard/SettingsModule';
import { WhatsappSettingsModule } from './modules/settings/WhatsappSettingsModule';

function App() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<Navigate to="/chats" replace />} />
        <Route path="chats" element={<ChatsModule />} />
        <Route path="knowledge-base" element={<KnowledgeBaseModule />} />
        <Route path="bot" element={<BotPersonalityModule />} />
        <Route path="workflows" element={<WorkflowModule />} />
        <Route path="campaigns" element={<CampaignsModule />} />

        {/* Settings */}
        <Route path="settings" element={<SettingsModule />} />
        <Route path="settings/whatsapp" element={<WhatsappSettingsModule />} />
      </Route>
    </Routes>
  );
}

export default App;
