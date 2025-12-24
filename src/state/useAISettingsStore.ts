// src/state/useAISettingsStore.ts
import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";
import { useOrganizationStore } from "./useOrganizationStore";
import { useSubOrganizationStore } from "./useSubOrganizationStore";
import type { AISettings, AIProvider, KBSearchType } from "../types/database";

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

  /**
   * true = using ORG-LEVEL settings because division has no override
   */
  isOrgFallback: boolean;

  fetchSettings: () => Promise<void>;
  saveSettings: (params: {
    ai_enabled: boolean;
    provider: AIProvider;
    model: string;
    kb_search_type: KBSearchType;
  }) => Promise<void>;

  clearError: () => void;
  clearSuccess: () => void;
};

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

export const useAISettingsStore = create<AISettingsState>((set, get) => ({
  settings: null,
  loading: false,
  saving: false,
  error: null,
  success: null,
  isOrgFallback: false,

  clearError: () => set({ error: null }),
  clearSuccess: () => set({ success: null }),

  /* =====================================================================================
     FETCH SETTINGS (division override → org fallback)
  ====================================================================================== */
  fetchSettings: async () => {
    const { currentOrganization } = useOrganizationStore.getState();
    const { activeSubOrg } = useSubOrganizationStore.getState();

    if (!currentOrganization) {
      set({
        error: "Select an organization to configure AI settings.",
        settings: null,
        isOrgFallback: false,
      });
      return;
    }

    set({ loading: true, error: null });

    try {
      const orgId = currentOrganization.id;
      const subOrgId = activeSubOrg?.id ?? null;

      // 1) If a division is selected, try division override first
      if (subOrgId) {
        const { data: subData, error: subErr } = await supabase
          .from("ai_settings")
          .select("*")
          .eq("organization_id", orgId)
          .eq("sub_organization_id", subOrgId)
          .maybeSingle();

        if (subErr) {
          set({
            loading: false,
            settings: null,
            isOrgFallback: false,
            error: subErr.message,
          });
          return;
        }

        if (subData) {
          set({
            loading: false,
            settings: normalizeSettings(subData),
            isOrgFallback: false,
          });
          return;
        }

        // 2) Fallback to org-level (sub_organization_id is null)
        const { data: orgData, error: orgErr } = await supabase
          .from("ai_settings")
          .select("*")
          .eq("organization_id", orgId)
          .is("sub_organization_id", null)
          .maybeSingle();

        if (orgErr) {
          set({
            loading: false,
            settings: null,
            isOrgFallback: false,
            error: orgErr.message,
          });
          return;
        }

        if (orgData) {
          set({
            loading: false,
            settings: normalizeSettings(orgData),
            isOrgFallback: true,
          });
          return;
        }

        // No settings exist yet
        set({ loading: false, settings: null, isOrgFallback: false });
        return;
      }

      // Org-level context
      const { data, error } = await supabase
        .from("ai_settings")
        .select("*")
        .eq("organization_id", orgId)
        .is("sub_organization_id", null)
        .maybeSingle();

      if (error) {
        set({
          loading: false,
          settings: null,
          isOrgFallback: false,
          error: error.message,
        });
        return;
      }

      set({
        loading: false,
        settings: normalizeSettings(data),
        isOrgFallback: false,
      });
    } catch (err: any) {
      set({
        loading: false,
        settings: null,
        isOrgFallback: false,
        error: err?.message ?? "Unexpected error while loading AI settings.",
      });
    }
  },

  /* =====================================================================================
     SAVE SETTINGS (upsert by org + sub_org scope)
  ====================================================================================== */
  saveSettings: async ({ ai_enabled, provider, model, kb_search_type }) => {
    const { currentOrganization } = useOrganizationStore.getState();
    const { activeSubOrg } = useSubOrganizationStore.getState();
    const { settings } = get();

    if (!currentOrganization) {
      set({ error: "Select an organization before saving AI settings." });
      return;
    }

    set({ saving: true, error: null, success: null });

    try {
      const payload: any = {
        organization_id: currentOrganization.id,
        sub_organization_id: activeSubOrg?.id ?? null,
        ai_enabled,
        provider,
        model,
        kb_search_type,
      };

      // Preserve ID if editing same-scope row
      if (
        settings &&
        settings.organization_id === payload.organization_id &&
        settings.sub_organization_id === payload.sub_organization_id
      ) {
        payload.id = settings.id;
      }

      const { data, error } = await supabase
        .from("ai_settings")
        .upsert(payload, { onConflict: "organization_id,sub_organization_id" })
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
        isOrgFallback: false,
      });

      setTimeout(() => {
        if (get().success) set({ success: null });
      }, 2000);
    } catch (err: any) {
      set({
        saving: false,
        error: err?.message ?? "Unexpected error while saving AI settings.",
      });
    }
  },
}));
