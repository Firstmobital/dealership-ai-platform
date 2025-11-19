import { FormEvent, useEffect, useState } from 'react';
import { Info, Loader2, Phone, Save } from 'lucide-react';
import { useOrganizationStore } from '../../state/useOrganizationStore';
import { useWhatsappSettingsStore } from '../../state/useWhatsappSettingsStore';

type FormState = {
  phone_number: string;
  api_token: string;
  verify_token: string;
  whatsapp_phone_id: string;
  whatsapp_business_id: string;
};

type Status =
  | { type: 'success'; message: string }
  | { type: 'error'; message: string }
  | null;

export function WhatsappSettingsModule() {
  const { currentOrganization } = useOrganizationStore();
  const { settings, loading, loadSettings, saveSettings } = useWhatsappSettingsStore();

  const [form, setForm] = useState<FormState>({
    phone_number: '',
    api_token: '',
    verify_token: '',
    whatsapp_phone_id: '',
    whatsapp_business_id: ''
  });

  const [status, setStatus] = useState<Status>(null);

  // Load settings when organization changes
  useEffect(() => {
    if (!currentOrganization?.id) return;

    loadSettings(currentOrganization.id).catch(() => {
      setStatus({
        type: 'error',
        message: 'Failed to load WhatsApp settings. Check console for details.'
      });
    });
  }, [currentOrganization?.id, loadSettings]);

  // Sync form when settings change
  useEffect(() => {
    if (!settings) {
      setForm({
        phone_number: '',
        api_token: '',
        verify_token: '',
        whatsapp_phone_id: '',
        whatsapp_business_id: ''
      });
      return;
    }

    setForm({
      phone_number: settings.phone_number ?? '',
      api_token: settings.api_token ?? '',
      verify_token: settings.verify_token ?? '',
      whatsapp_phone_id: settings.whatsapp_phone_id ?? '',
      whatsapp_business_id: settings.whatsapp_business_id ?? ''
    });
  }, [settings]);

  const handleChange =
    (field: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setForm((prev) => ({ ...prev, [field]: value }));
    };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!currentOrganization?.id) {
      setStatus({
        type: 'error',
        message: 'Please select an organization first.'
      });
      return;
    }

    setStatus(null);

    try {
      await saveSettings(currentOrganization.id, form);
      setStatus({
        type: 'success',
        message: 'WhatsApp settings saved successfully.'
      });
    } catch {
      setStatus({
        type: 'error',
        message: 'Failed to save WhatsApp settings.'
      });
    }
  };

  if (!currentOrganization) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-white/5 bg-slate-950/60 p-6 text-sm text-slate-400">
        Select an organization from the top-left to configure WhatsApp settings.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-white">
            <Phone className="text-accent" size={20} />
            WhatsApp Settings
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Configure WhatsApp Cloud API credentials for{' '}
            <span className="font-medium text-slate-200">
              {currentOrganization.name}
            </span>
            .
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-6 rounded-2xl border border-white/5 bg-slate-950/80 p-6"
      >
        {status && (
          <div
            className={`rounded-lg px-4 py-2 text-sm ${
              status.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-300'
                : 'bg-rose-500/10 text-rose-300'
            }`}
          >
            {status.message}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Phone number */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
              WhatsApp Phone Number
            </label>
            <input
              type="text"
              value={form.phone_number}
              onChange={handleChange('phone_number')}
              placeholder="e.g. 9174xxxxxxxx"
              className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none ring-accent/30 focus:border-accent focus:ring-2"
            />
            <p className="text-xs text-slate-500">
              Full phone number connected to your WhatsApp Business account (without
              the + sign).
            </p>
          </div>

          {/* API token */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Permanent Access Token
            </label>
            <input
              type="password"
              value={form.api_token}
              onChange={handleChange('api_token')}
              placeholder="EAAGxxxxxxxxxxxxxxxx"
              className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none ring-accent/30 focus:border-accent focus:ring-2"
            />
            <p className="text-xs text-slate-500">
              System user token from Meta for the WhatsApp Business Cloud API.
            </p>
          </div>

          {/* Verify token */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Verify Token
            </label>
            <input
              type="text"
              value={form.verify_token}
              onChange={handleChange('verify_token')}
              placeholder="Custom verify token used in webhook setup"
              className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none ring-accent/30 focus:border-accent focus:ring-2"
            />
          </div>

          {/* Phone ID */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
              WhatsApp Phone Number ID
            </label>
            <input
              type="text"
              value={form.whatsapp_phone_id}
              onChange={handleChange('whatsapp_phone_id')}
              placeholder="e.g. 123456789012345"
              className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none ring-accent/30 focus:border-accent focus:ring-2"
            />
          </div>

          {/* Business ID */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
              WhatsApp Business Account ID
            </label>
            <input
              type="text"
              value={form.whatsapp_business_id}
              onChange={handleChange('whatsapp_business_id')}
              placeholder="e.g. 123456789012345"
              className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none ring-accent/30 focus:border-accent focus:ring-2"
            />
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between">
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <Info size={14} />
            These settings are stored per organization in the{' '}
            <code className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-200">
              whatsapp_settings
            </code>{' '}
            table.
          </p>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/30 transition hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            <Save size={16} />
            <span>{loading ? 'Saving...' : 'Save settings'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
