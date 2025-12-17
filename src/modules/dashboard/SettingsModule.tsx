///Users/air/dealership-ai-platform/src/modules/dashboard/SettingsModule.tsx

import { Shield, KeyRound, Database } from 'lucide-react';

export function SettingsModule() {
  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Shield size={18} className="text-accent" /> Security & RLS
        </h2>
        <p className="mt-3 text-sm text-slate-400">
          Manage Supabase Row Level Security policies and API keys for each dealership organization.
        </p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-300">
          <li>Organization-based policies for contacts and conversations.</li>
          <li>Edge function secrets for WhatsApp Cloud API.</li>
          <li>Audit log exports to storage buckets.</li>
        </ul>
      </div>

      <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <KeyRound size={18} className="text-accent" /> Integrations
        </h2>
        <p className="mt-3 text-sm text-slate-400">
          Connect CRM, DMS, and WhatsApp credentials for automated messaging workflows.
        </p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-300">
          <li>API keys for OEM price feeds.</li>
          <li>Webhook URL management.</li>
          <li>LLM provider selection.</li>
        </ul>
      </div>

      <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Database size={18} className="text-accent" /> Data Retention
        </h2>
        <p className="mt-3 text-sm text-slate-400">
          Configure retention windows for messages, campaigns, and knowledge base entries.
        </p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-300">
          <li>Archive campaigns older than 90 days.</li>
          <li>Rotate embeddings every 6 months.</li>
          <li>Export reports to S3-compatible storage.</li>
        </ul>
      </div>
    </div>
  );
}

