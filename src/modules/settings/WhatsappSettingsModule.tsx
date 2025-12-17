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
    if (!settings) return;
    setForm({
      phone_number: settings.phone_number ?? "",
      api_token: settings.api_token ?? "",
      verify_token: settings.verify_token ?? "",
      whatsapp_phone_id: settings.whatsapp_phone_id ?? "",
      whatsapp_business_id: settings.whatsapp_business_id ?? "",
      is_active: settings.is_active ?? true,
    });
  }, [settings]);

  const update = (k: keyof typeof form, v: any) =>
    setForm((p) => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    await saveSettings({
      ...form,
      phone_number: form.phone_number || null,
    });
  };

  return (
    <div className="flex h-full flex-col px-6 py-6 text-slate-200">
      <h1 className="text-xl font-semibold text-white">WhatsApp Settings</h1>

      <div className="mt-4">
        {activeSubOrg ? (
          isOrgFallback ? (
            <div className="flex gap-2 text-yellow-300">
              <AlertTriangle size={16} />
              Using organization defaults
            </div>
          ) : (
            <div className="flex gap-2 text-green-300">
              <ShieldCheck size={16} />
              Division override active
            </div>
          )
        ) : (
          <div className="flex gap-2 text-blue-300">
            <Phone size={16} />
            Organization-level settings
          </div>
        )}
      </div>

      <form
        onSubmit={submit}
        className="mt-6 max-w-2xl space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-6"
      >
        {[
          ["phone_number", "Phone Number"],
          ["api_token", "API Token"],
          ["verify_token", "Verify Token"],
          ["whatsapp_phone_id", "Phone ID"],
          ["whatsapp_business_id", "Business ID"],
        ].map(([k, label]) => (
          <div key={k}>
            <label className="text-xs text-slate-400">{label}</label>
            <input
              value={(form as any)[k]}
              onChange={(e) => update(k as any, e.target.value)}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white"
            />
          </div>
        ))}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => update("is_active", e.target.checked)}
          />
          Enable WhatsApp
        </label>

        <button
          disabled={saving}
          className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm text-white"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save size={14} />}
          Save
        </button>

        {error && (
          <div className="flex gap-2 text-xs text-red-300">
            <ShieldAlert size={14} /> {error}
          </div>
        )}

        {success && (
          <div className="flex gap-2 text-xs text-green-300">
            <ShieldCheck size={14} /> {success}
          </div>
        )}
      </form>

      {loading && (
        <div className="mt-4 flex gap-2 text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}
    </div>
  );
}
