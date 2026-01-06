// src/modules/settings/AIConfigurationModule.tsx
import { useEffect, useMemo, useState } from "react";
import {
  Settings2,
  Loader2,
  Save,
} from "lucide-react";

import { useOrganizationStore } from "../../state/useOrganizationStore";
import {
  DEFAULT_AI_SETTINGS,
  useAISettingsStore,
} from "../../state/useAISettingsStore";

import type { AIProvider, KBSearchType } from "../../types/database";

/* ============================================================
   PRICING CONFIG — Phase 4 (Option A)
   - Simple ₹ / conversation (display only)
   - No wallet, no enforcement
============================================================ */

type ModelCard = {
  provider: AIProvider;
  model: string;
  title: string;
  description: string;
  pricePerConversation: number; // ₹
};

type SearchCard = {
  key: KBSearchType;
  title: string;
  description: string;
  addOnPrice: number; // ₹
  badge?: string;
};

const MODEL_CARDS: ModelCard[] = [
  {
    provider: "gemini",
    model: "gemini-2.5-flash",
    title: "Gemini 2.5 Flash",
    description: "Best for small knowledge bases and simple queries. Fast + cost-efficient.",
    pricePerConversation: 2.5,
  },
  {
    provider: "openai",
    model: "gpt-4o-mini",
    title: "OpenAI 4o Mini",
    description: "Best for small knowledge bases and simple queries. Reliable and quick.",
    pricePerConversation: 2.5,
  },
  {
    provider: "gemini",
    model: "gemini-2.5-pro",
    title: "Gemini 2.5 Pro",
    description: "Best for complex queries and advanced reasoning workflows.",
    pricePerConversation: 3.5,
  },
  {
    provider: "gemini",
    model: "gemini-3-pro",
    title: "Gemini 3 Pro (Preview)",
    description: "Best for large knowledge bases and more natural, human-like responses.",
    pricePerConversation: 14,
  },
];

const SEARCH_CARDS: SearchCard[] = [
  {
    key: "default",
    title: "Default",
    description: "Searches sections that match the meaning of the user’s question.",
    addOnPrice: 0,
    badge: "Free",
  },
  {
    key: "hybrid",
    title: "Hybrid Search",
    description: "Searches full KB by keywords, then matches intent for best results.",
    addOnPrice: 1.5,
    badge: "+₹1.5 / Conversation",
  },
  {
    key: "title",
    title: "Search With Titles",
    description: "Filters articles by topic/title first, then answers from matches.",
    addOnPrice: 2.5,
    badge: "+₹2.5 / Conversation",
  },
];

function formatINR(n: number) {
  const fixed = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return `₹${fixed}`;
}

export function AIConfigurationModule() {
  const { activeOrganization } = useOrganizationStore();

  const {
    settings,
    loading,
    saving,
    error,
    success,
    fetchSettings,
    saveSettings,
    clearError,
    clearSuccess,
  } = useAISettingsStore();

  const [form, setForm] = useState({
    ai_enabled: DEFAULT_AI_SETTINGS.ai_enabled,
    provider: DEFAULT_AI_SETTINGS.provider as AIProvider,
    model: DEFAULT_AI_SETTINGS.model,
    kb_search_type: DEFAULT_AI_SETTINGS.kb_search_type as KBSearchType,
  });

  /* -------------------------------------------------------
     LOAD SETTINGS
  ------------------------------------------------------- */
  useEffect(() => {
    if (!activeOrganization?.id) return;
    fetchSettings().catch(console.error);
  }, [activeOrganization?.id]);

  useEffect(() => {
    if (!settings) {
      setForm((p) => ({
        ...p,
        ...DEFAULT_AI_SETTINGS,
      }));
      return;
    }

    setForm({
      ai_enabled: settings.ai_enabled ?? true,
      provider: (settings.provider ?? "openai") as AIProvider,
      model: settings.model ?? "gpt-4o-mini",
      kb_search_type: (settings.kb_search_type ?? "default") as KBSearchType,
    });
  }, [settings]);

  /* -------------------------------------------------------
     DERIVED COST
  ------------------------------------------------------- */
  const modelCost = useMemo(() => {
    const found = MODEL_CARDS.find(
      (m) => m.provider === form.provider && m.model === form.model
    );
    return found?.pricePerConversation ?? 0;
  }, [form.provider, form.model]);

  const searchCost = useMemo(() => {
    const found = SEARCH_CARDS.find((s) => s.key === form.kb_search_type);
    return found?.addOnPrice ?? 0;
  }, [form.kb_search_type]);

  const finalCost = useMemo(
    () => modelCost + searchCost,
    [modelCost, searchCost]
  );

  /* -------------------------------------------------------
     CHANGE HELPERS
  ------------------------------------------------------- */
  const setModel = (provider: AIProvider, model: string) => {
    setForm((p) => ({ ...p, provider, model }));
  };

  const setSearchType = (key: KBSearchType) => {
    setForm((p) => ({ ...p, kb_search_type: key }));
  };

  const setEnabled = (v: boolean) =>
    setForm((p) => ({ ...p, ai_enabled: v }));

  const hasChanges =
    (settings?.ai_enabled ?? DEFAULT_AI_SETTINGS.ai_enabled) !== form.ai_enabled ||
    (settings?.provider ?? DEFAULT_AI_SETTINGS.provider) !== form.provider ||
    (settings?.model ?? DEFAULT_AI_SETTINGS.model) !== form.model ||
    (settings?.kb_search_type ?? DEFAULT_AI_SETTINGS.kb_search_type) !==
      form.kb_search_type;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    clearSuccess();

    await saveSettings({
      ai_enabled: form.ai_enabled,
      provider: form.provider,
      model: form.model,
      kb_search_type: form.kb_search_type,
    });
  };

  /* -------------------------------------------------------
     UI
  ------------------------------------------------------- */
  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          AI Configuration
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Choose the AI model and knowledge base search type for this organization.
        </p>
      </div>

      {/* Context Banner */}
      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
        <Settings2 size={18} className="text-blue-600" />
        <p className="text-sm text-blue-800">
          Organization-level AI configuration. All workflows and conversations use these settings.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Enable toggle */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                AI Enabled
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Turn AI on/off for this organization.
              </p>
            </div>

            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.ai_enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              Enabled
            </label>
          </div>
        </div>

        {/* AI Models */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-slate-900">
              AI Models
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Select the AI model best suited for your tasks.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {MODEL_CARDS.map((m) => {
              const selected =
                form.provider === m.provider && form.model === m.model;

              return (
                <button
                  key={`${m.provider}:${m.model}`}
                  type="button"
                  onClick={() => setModel(m.provider, m.model)}
                  className={[
                    "text-left rounded-xl border p-4 transition",
                    selected
                      ? "border-blue-500 ring-2 ring-blue-100"
                      : "border-slate-200 hover:border-slate-300",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {m.title}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {m.description}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      {selected && (
                        <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                          ✓ Selected
                        </span>
                      )}
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                        {formatINR(m.pricePerConversation)}/Conversation
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 text-[10px] uppercase tracking-wide text-slate-400">
                    Provider: {m.provider.toUpperCase()}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Search Type */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-slate-900">
              Search type for knowledge base
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Select a search option that best matches your knowledge base.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {SEARCH_CARDS.map((s) => {
              const selected = form.kb_search_type === s.key;

              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSearchType(s.key)}
                  className={[
                    "text-left rounded-xl border p-4 transition",
                    selected
                      ? "border-blue-500 ring-2 ring-blue-100"
                      : "border-slate-200 hover:border-slate-300",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {s.title}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {s.description}
                      </p>
                    </div>

                    {selected && (
                      <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                        ✓
                      </span>
                    )}
                  </div>

                  <div className="mt-3">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                      {s.badge ?? `${formatINR(s.addOnPrice)}/Conversation`}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-5 text-sm text-slate-700">
            <span className="font-semibold">Final cost:</span>{" "}
            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-800">
              {formatINR(finalCost)} / Conversation
            </span>
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving || !hasChanges}
            className="inline-flex items-center gap-2 rounded-md bg-accent px-5 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save size={16} />
            )}
            Save Settings
          </button>

          {loading && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading AI settings…
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}
          {success && <p className="text-sm text-green-600">{success}</p>}
        </div>
      </form>
    </div>
  );
}
