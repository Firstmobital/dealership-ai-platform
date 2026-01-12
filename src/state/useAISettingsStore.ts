import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";
import { useOrganizationStore } from "./useOrganizationStore";
import type { AISettings, AIProvider, KBSearchType } from "../types/database";

/* ============================================================================
   DEFAULTS
============================================================================ */

export const DEFAULT_AI_SETTINGS: Pick<
  AISettings,
  "ai_enabled" | "provider" | "model" | "kb_search_type"
> = {
  ai_enabled: true,
  provider: "openai",
  model: "gpt-4o-mini",
  kb_search_type: "default",
};

type AISettingsState = {
  settings: AISettings | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  success: string | null;

  fetchSettings: () => Promise<void>;
  saveSettings: (params: {
    ai_enabled: boolean;
    provider: AIProvider;
    model: string;
    kb_search_type: KBSearchType;
  }) => Promise<void>;

  clearError: () => void;
  clearSuccess: () => void;

  reset: () => void;
};

/* ============================================================================
   HELPERS
============================================================================ */

function normalizeSettings(raw: any | null): AISettings | null {
  if (!raw) return null;

  return {
    ...raw,
    ai_enabled: raw.ai_enabled ?? true,
    provider: (raw.provider ?? "openai") as AIProvider,
    model: raw.model ?? "gpt-4o-mini",
    kb_search_type: (raw.kb_search_type ?? "default") as KBSearchType,
  } as AISettings;
}

/* ============================================================================
   STORE
============================================================================ */

export const useAISettingsStore = create<AISettingsState>((set, get) => ({
  settings: null,
  loading: false,
  saving: false,
  error: null,
  success: null,

  reset: () =>
    set({
      settings: null,
      loading: false,
      saving: false,
      error: null,
      success: null,
    }),

  clearError: () => set({ error: null }),
  clearSuccess: () => set({ success: null }),

  /* --------------------------------------------------------------------------
     FETCH SETTINGS (ORGANIZATION ONLY)
  -------------------------------------------------------------------------- */
  fetchSettings: async () => {
    const { activeOrganization } = useOrganizationStore.getState();

    if (!activeOrganization?.id) {
      set({
        error: "Select an organization to configure AI settings.",
        settings: null,
      });
      return;
    }

    set({ loading: true, error: null });

    try {
      const { data, error } = await supabase
        .from("ai_settings")
        .select("*")
        .eq("organization_id", activeOrganization.id)
        .maybeSingle();

      if (error) {
        set({
          loading: false,
          settings: null,
          error: error.message,
        });
        return;
      }

      set({
        loading: false,
        settings: normalizeSettings(data),
      });
    } catch (err: any) {
      set({
        loading: false,
        settings: null,
        error:
          err?.message ?? "Unexpected error while loading AI settings.",
      });
    }
  },

  /* --------------------------------------------------------------------------
     SAVE SETTINGS (UPSERT BY ORGANIZATION)
  -------------------------------------------------------------------------- */
  saveSettings: async ({ ai_enabled, provider, model, kb_search_type }) => {
    const { activeOrganization } = useOrganizationStore.getState();
    const { settings } = get();

    if (!activeOrganization?.id) {
      set({ error: "Select an organization before saving AI settings." });
      return;
    }

    set({ saving: true, error: null, success: null });

    try {
      const payload: any = {
        organization_id: activeOrganization.id,
        ai_enabled,
        provider,
        model,
        kb_search_type,
      };

      // Preserve row ID if updating existing record
      if (
        settings &&
        settings.organization_id === activeOrganization.id
      ) {
        payload.id = settings.id;
      }

      const { data, error } = await supabase
        .from("ai_settings")
        .upsert(payload, { onConflict: "organization_id" })
        .select("*")
        .single();

      if (error) {
        set({ saving: false, error: error.message });
        return;
      }

      set({
        saving: false,
        settings: normalizeSettings(data),
        success: "AI settings saved successfully!",
      });

      setTimeout(() => {
        if (get().success) set({ success: null });
      }, 2000);
    } catch (err: any) {
      set({
        saving: false,
        error:
          err?.message ?? "Unexpected error while saving AI settings.",
      });
    }
  },
}));
