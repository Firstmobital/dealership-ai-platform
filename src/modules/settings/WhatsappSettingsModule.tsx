import { useEffect, useState, FormEvent } from "react";
import {
  Info,
  Phone,
  Save,
  Loader2,
  EyeOff,
  Eye,
  SendHorizontal,
  Copy,
  Check,
} from "lucide-react";

import { useOrganizationStore } from "../../state/useOrganizationStore";
import { useWhatsappSettingsStore } from "../../state/useWhatsappSettingsStore";

type FormState = {
  phone_number: string;
  api_token: string;
  verify_token: string;
  whatsapp_phone_id: string;
  whatsapp_business_id: string;
};

type Status =
  | { type: "success"; message: string }
  | { type: "error"; message: string }
  | null;

export function WhatsappSettingsModule() {
  const { currentOrganization } = useOrganizationStore();
  const {
    settings,
    loading,
    loadSettings,
    saveSettings,
  } = useWhatsappSettingsStore();

  const [form, setForm] = useState<FormState>({
    phone_number: "",
    api_token: "",
    verify_token: "",
    whatsapp_phone_id: "",
    whatsapp_business_id: "",
  });

  const [status, setStatus] = useState<Status>(null);
  const [apiVisible, setApiVisible] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [testSending, setTestSending] = useState(false);
  const [saveComplete, setSaveComplete] = useState(false);

  const webhookUrl = `${window.location.origin}/functions/v1/whatsapp-inbound`;

  // -------------------------------------------------------------
  // Load settings when organization changes
  // -------------------------------------------------------------
  useEffect(() => {
    if (!currentOrganization?.id) return;

    loadSettings(currentOrganization.id).catch(() =>
      setStatus({
        type: "error",
        message: "Failed to load WhatsApp settings. Check console.",
      })
    );
  }, [currentOrganization?.id, loadSettings]);

  // -------------------------------------------------------------
  // Sync form when settings change
  // -------------------------------------------------------------
  useEffect(() => {
    if (!settings) return;

    setForm({
      phone_number: settings.phone_number ?? "",
      api_token: settings.api_token ?? "",
      verify_token: settings.verify_token ?? "",
      whatsapp_phone_id: settings.whatsapp_phone_id ?? "",
      whatsapp_business_id: settings.whatsapp_business_id ?? "",
    });
  }, [settings]);

  // -------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------
  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 1500);
  };

  const isConnected =
    form.phone_number &&
    form.api_token &&
    form.whatsapp_phone_id &&
    form.whatsapp_business_id;

  const handleChange =
    (field: keyof FormState) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: event.target.value }));
    };

  // -------------------------------------------------------------
  // SAVE SETTINGS
  // -------------------------------------------------------------
  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!currentOrganization?.id) {
      setStatus({ type: "error", message: "Select an organization first." });
      return;
    }

    try {
      await saveSettings(currentOrganization.id, form);
      setStatus({ type: "success", message: "Settings saved." });

      setSaveComplete(true);
      setTimeout(() => setSaveComplete(false), 2000);
    } catch {
      setStatus({ type: "error", message: "Failed to save settings." });
    }
  };

  // -------------------------------------------------------------
  // SEND TEST MESSAGE
  // -------------------------------------------------------------
  const sendTestMessage = async () => {
    if (!currentOrganization?.id) return;
    if (!form.phone_number) {
      setStatus({
        type: "error",
        message: "Enter a target phone number first.",
      });
      return;
    }

    setTestSending(true);
    setStatus(null);

    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-send`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            organization_id: currentOrganization.id,
            to: form.phone_number,
            type: "text",
            text: "Hello! This is a test message from Techwheels AI. 🚗",
          }),
        }
      );

      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data?.error || "Test send failed");
      }

      setStatus({
        type: "success",
        message: "Test message sent successfully.",
      });
    } catch (err: any) {
      setStatus({
        type: "error",
        message: err?.message || "Failed to send test message",
      });
    }

    setTestSending(false);
  };

  // -------------------------------------------------------------
  // UI
  // -------------------------------------------------------------
  if (!currentOrganization) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-white/5 bg-slate-950/60 p-6 text-sm text-slate-400">
        Select an organization to configure WhatsApp settings.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-white">
            <Phone className="text-accent" size={20} />
            WhatsApp Settings
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Configure WhatsApp Cloud API for{" "}
            <span className="text-slate-200">{currentOrganization.name}</span>
          </p>
        </div>

        {/* Status Indicator */}
        <div
          className={`rounded-full px-4 py-1 text-xs font-semibold ${
            isConnected
              ? "bg-emerald-600/20 text-emerald-300"
              : "bg-rose-600/20 text-rose-300"
          }`}
        >
          {isConnected ? "Connected" : "Not Connected"}
        </div>
      </div>

      {/* FORM */}
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-6 rounded-2xl border border-white/5 bg-slate-950/80 p-6"
      >
        {/* Status Banner */}
        {status && (
          <div
            className={`rounded-lg px-4 py-2 text-sm ${
              status.type === "success"
                ? "bg-emerald-500/10 text-emerald-300"
                : "bg-rose-500/10 text-rose-300"
            }`}
          >
            {status.message}
          </div>
        )}

        {/* 2 Column Inputs */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* PHONE NUMBER */}
          <InputField
            label="WhatsApp Phone Number"
            value={form.phone_number}
            onChange={handleChange("phone_number")}
            placeholder="e.g. 9174xxxxxxx"
          />

          {/* API TOKEN with eye toggle */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Permanent Access Token
            </label>
            <div className="relative">
              <input
                type={apiVisible ? "text" : "password"}
                value={form.api_token}
                onChange={handleChange("api_token")}
                placeholder="EAAGxxxxx"
                className="w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white pr-10 outline-none ring-accent/30 focus:border-accent focus:ring-2"
              />
              <button
                type="button"
                onClick={() => setApiVisible((v) => !v)}
                className="absolute right-2 top-2 text-slate-400 hover:text-white"
              >
                {apiVisible ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* VERIFY TOKEN */}
          <InputField
            label="Verify Token"
            value={form.verify_token}
            onChange={handleChange("verify_token")}
            placeholder="Custom token for webhook verification"
          />

          {/* PHONE ID */}
          <InputField
            label="WhatsApp Phone Number ID"
            value={form.whatsapp_phone_id}
            onChange={handleChange("whatsapp_phone_id")}
            placeholder="123456789012345"
          />

          {/* BUSINESS ID */}
          <InputField
            label="WhatsApp Business Account ID"
            value={form.whatsapp_business_id}
            onChange={handleChange("whatsapp_business_id")}
            placeholder="123456789012345"
          />
        </div>

        {/* FOOTER ACTIONS */}
        <div className="mt-2 flex items-center justify-between">
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <Info size={14} />
            Settings stored in{" "}
            <code className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-200">
              whatsapp_settings
            </code>
            .
          </p>

          <button
            type="submit"
            disabled={loading}
            className={`inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/30 transition ${
              loading
                ? "opacity-60 cursor-not-allowed"
                : "hover:bg-accent/80"
            }`}
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : saveComplete ? (
              <Check size={16} />
            ) : (
              <Save size={16} />
            )}
            <span>
              {loading ? "Saving..." : saveComplete ? "Saved" : "Save settings"}
            </span>
          </button>
        </div>
      </form>

      {/* WEBHOOK + TEST MESSAGE SECTION */}
      <div className="rounded-2xl border border-white/5 bg-slate-950/80 p-6 flex flex-col gap-6">
        <h2 className="text-lg font-semibold text-white">Testing & Webhook</h2>

        {/* Test Message */}
        <button
          onClick={sendTestMessage}
          disabled={testSending}
          className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60 w-fit"
        >
          {testSending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <SendHorizontal size={16} />
          )}
          {testSending ? "Sending..." : "Send Test Message"}
        </button>

        {/* Webhook URL */}
        <WebhookField
          label="Webhook URL"
          value={webhookUrl}
          copied={copied === "webhook"}
          onCopy={() => copyToClipboard(webhookUrl, "webhook")}
        />

        {/* Verify Token */}
        <WebhookField
          label="Verify Token"
          value={form.verify_token}
          copied={copied === "verify"}
          onCopy={() => copyToClipboard(form.verify_token, "verify")}
        />

        <p className="text-xs text-slate-400">
          Add these values in Meta Business Dashboard →
          <span className="text-slate-200">API Setup → Webhooks</span>
        </p>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------
   SMALL REUSABLE COMPONENTS
-------------------------------------------------------------- */

function InputField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none ring-accent/30 focus:border-accent focus:ring-2"
      />
    </div>
  );
}

function WebhookField({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </label>

      <div className="relative flex items-center">
        <code className="w-full truncate rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-xs text-slate-200">
          {value}
        </code>

        <button
          onClick={onCopy}
          className="absolute right-2 text-slate-300 hover:text-white"
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </button>
      </div>
    </div>
  );
}
