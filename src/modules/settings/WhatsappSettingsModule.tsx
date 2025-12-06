// src/modules/settings/WhatsappSettingsModule.tsx

import { useEffect, useState } from "react";
import {
  Loader2,
  Phone,
  Save,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
} from "lucide-react";
import { useWhatsappSettingsStore } from "../../state/useWhatsappSettingsStore";
import { useOrganizationStore } from "../../state/useOrganizationStore";
import { useSubOrganizationStore } from "../../state/useSubOrganizationStore";

export function WhatsappSettingsModule() {
  const {
    settings,
    loading,
    saving,
    error,
    success,              // ✅ ADDED
    isOrgFallback,
    fetchSettings,
    saveSettings,
    clearError,
  } = useWhatsappSettingsStore();

  const { currentOrganization } = useOrganizationStore();
  const { activeSubOrg } = useSubOrganizationStore();

  const [form, setForm] = useState({
    phone_number: "",
    api_token: "",
    verify_token: "",
    whatsapp_phone_id: "",
    whatsapp_business_id: "",
    is_active: true,
  });

  useEffect(() => {
    if (!currentOrganization) return;
    fetchSettings().catch(console.error);
  }, [currentOrganization?.id, activeSubOrg?.id]);

  useEffect(() => {
    if (!settings) {
      setForm({
        phone_number: "",
        api_token: "",
        verify_token: "",
        whatsapp_phone_id: "",
        whatsapp_business_id: "",
        is_active: true,
      });
    } else {
      setForm({
        phone_number: settings.phone_number ?? "",
        api_token: settings.api_token ?? "",
        verify_token: settings.verify_token ?? "",
        whatsapp_phone_id: settings.whatsapp_phone_id ?? "",
        whatsapp_business_id: settings.whatsapp_business_id ?? "",
        is_active: settings.is_active ?? true,
      });
    }
  }, [settings]);

  const update = (field: keyof typeof form, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    await saveSettings({
      phone_number: form.phone_number.trim() || null,
      api_token: form.api_token.trim() || null,
      verify_token: form.verify_token.trim() || null,
      whatsapp_phone_id: form.whatsapp_phone_id.trim() || null,
      whatsapp_business_id: form.whatsapp_business_id.trim() || null,
      is_active: form.is_active,
    });
  };

  const isDivisionContext = Boolean(activeSubOrg);

  return (
    <div className="flex h-full flex-col px-6 py-6 text-slate-200">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-white">WhatsApp Settings</h1>
        <p className="text-sm text-slate-400">
          Configure WhatsApp Cloud API for this{" "}
          {isDivisionContext ? "division" : "organization"}.
        </p>
      </div>

      {/* Context Banner */}
      <div className="mt-4 mb-6">
        {activeSubOrg ? (
          isOrgFallback ? (
            <div className="flex items-center gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
              <AlertTriangle className="text-yellow-400" size={18} />
              <div className="text-xs text-yellow-200">
                <p>
                  Division: <b>{activeSubOrg.name}</b>
                </p>
                <p>
                  This division has <b>no WhatsApp override</b>. Using{" "}
                  <b>organization-level</b> settings.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/10 p-3">
              <ShieldCheck className="text-green-400" size={18} />
              <div className="text-xs text-green-200">
                <p>
                  Division: <b>{activeSubOrg.name}</b>
                </p>
                <p>This division has its <b>own WhatsApp configuration</b>.</p>
              </div>
            </div>
          )
        ) : (
          <div className="flex items-center gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
            <Phone className="text-blue-400" size={18} />
            <div className="text-xs text-blue-200">
              <p>Configuring <b>organization-level</b> WhatsApp settings.</p>
              <p>Divisions without overrides will inherit these settings.</p>
            </div>
          </div>
        )}
      </div>

      {/* Settings Form */}
      <form
        onSubmit={handleSubmit}
        className="flex max-w-2xl flex-col gap-4 rounded-xl border border-slate-700 bg-slate-900 p-6"
      >
        {/* Phone */}
        <div>
          <label className="mb-1 block text-xs text-slate-400">
            WhatsApp Phone Number (with country code)
          </label>
          <input
            type="text"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            value={form.phone_number}
            onChange={(e) => update("phone_number", e.target.value)}
            placeholder="e.g. 919999888877"
            disabled={saving}
          />
        </div>

        {/* API Token */}
        <div>
          <label className="mb-1 block text-xs text-slate-400">
            Permanent API Token
          </label>
          <input
            type="password"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            value={form.api_token}
            onChange={(e) => update("api_token", e.target.value)}
            placeholder="EAAG... system user token"
            disabled={saving}
          />
        </div>

        {/* Verify Token */}
        <div>
          <label className="mb-1 block text-xs text-slate-400">
            Webhook Verify Token
          </label>
          <input
            type="text"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            value={form.verify_token}
            onChange={(e) => update("verify_token", e.target.value)}
            placeholder="Your webhook verify token"
            disabled={saving}
          />
        </div>

        {/* Phone ID */}
        <div>
          <label className="mb-1 block text-xs text-slate-400">
            WhatsApp Phone ID
          </label>
          <input
            type="text"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            value={form.whatsapp_phone_id}
            onChange={(e) => update("whatsapp_phone_id", e.target.value)}
            placeholder="123456789012345"
            disabled={saving}
          />
        </div>

        {/* Business ID */}
        <div>
          <label className="mb-1 block text-xs text-slate-400">
            WhatsApp Business Account ID
          </label>
          <input
            type="text"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            value={form.whatsapp_business_id}
            onChange={(e) => update("whatsapp_business_id", e.target.value)}
            placeholder="1234567890"
            disabled={saving}
          />
        </div>

        {/* Active */}
        <div className="flex items-center gap-3 pt-2">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => update("is_active", e.target.checked)}
            className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-accent"
            disabled={saving}
          />
          <span className="text-sm text-slate-300">Enable WhatsApp</span>
        </div>

        {/* Save */}
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 rounded-md bg-accent px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Save className="h-4 w-4" /> Save Settings
            </>
          )}
        </button>

        {/* Error */}
        {error && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
            <ShieldAlert size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Success */}
        {success && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-green-500/30 bg-green-500/10 p-3 text-xs text-green-300">
            <ShieldCheck size={16} />
            <span>{success}</span>
          </div>
        )}
      </form>

      {/* Bottom Loading */}
      {loading && (
        <div className="mt-6 flex items-center gap-2 text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-xs">Loading WhatsApp settings…</span>
        </div>
      )}
    </div>
  );
}
