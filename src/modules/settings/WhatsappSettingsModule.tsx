import { useEffect, useState } from "react";
import {
  Loader2,
  Phone,
  Save,
  ShieldCheck,
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
    success,
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
    whatsapp_phone_id: "",
    whatsapp_business_id: "",
    is_active: true,
  });

  /* ------------------------------------------------------------------ */
  /* LOAD SETTINGS                                                       */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    if (!currentOrganization) return;
    fetchSettings().catch(console.error);
  }, [currentOrganization?.id, activeSubOrg?.id]);

  useEffect(() => {
    if (!settings) return;
    setForm({
      phone_number: settings.phone_number ?? "",
      api_token: settings.api_token ?? "",
      whatsapp_phone_id: settings.whatsapp_phone_id ?? "",
      whatsapp_business_id: settings.whatsapp_business_id ?? "",
      is_active: settings.is_active ?? true,
    });
  }, [settings]);

  const update = (k: keyof typeof form, v: any) =>
    setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    await saveSettings({
      phone_number: form.phone_number || null,
      api_token: form.api_token || null,
      whatsapp_phone_id: form.whatsapp_phone_id || null,
      whatsapp_business_id: form.whatsapp_business_id || null,
      is_active: form.is_active,
    });
  };

  const isDivisionContext = Boolean(activeSubOrg);

  /* ------------------------------------------------------------------ */
  /* UI                                                                 */
  /* ------------------------------------------------------------------ */
  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          WhatsApp Settings
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Configure WhatsApp Cloud API for this{" "}
          {isDivisionContext ? "division" : "organization"}.
        </p>
      </div>

      {/* Context Banner */}
      {activeSubOrg && isOrgFallback && (
        <div className="flex items-start gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3">
          <AlertTriangle size={18} className="text-yellow-500" />
          <p className="text-sm text-yellow-800">
            This division has no WhatsApp override. Using organization-level
            settings.
          </p>
        </div>
      )}

      {activeSubOrg && !isOrgFallback && (
        <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-3">
          <ShieldCheck size={18} className="text-green-600" />
          <p className="text-sm text-green-800">
            Division-specific WhatsApp configuration is active.
          </p>
        </div>
      )}

      {!activeSubOrg && (
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
          <Phone size={18} className="text-blue-600" />
          <p className="text-sm text-blue-800">
            Organization-level WhatsApp settings. Divisions inherit these by
            default.
          </p>
        </div>
      )}

      {/* Card */}
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
      >
        {[
          ["Phone Number", "phone_number", "e.g. 919999888877"],
          ["API Token", "api_token", "Permanent API token"],
          ["Phone ID", "whatsapp_phone_id", "Meta phone ID"],
          ["Business ID", "whatsapp_business_id", "Business account ID"],
        ].map(([label, key, placeholder]) => (
          <div key={key}>
            <label className="block text-xs font-medium text-slate-600">
              {label}
            </label>
            <input
              type="text"
              value={(form as any)[key]}
              onChange={(e) => update(key as any, e.target.value)}
              placeholder={placeholder}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
        ))}

        <label className="flex items-center gap-2 pt-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => update("is_active", e.target.checked)}
          />
          Enable WhatsApp
        </label>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-md bg-accent px-5 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-60"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save size={16} />
          )}
          Save Settings
        </button>

        {error && <p className="text-sm text-red-500">{error}</p>}
        {success && <p className="text-sm text-green-600">{success}</p>}
      </form>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading WhatsApp settings…
        </div>
      )}
    </div>
  );
}
