// src/state/useWhatsappSettingsStore.ts
import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";
import { useOrganizationStore } from "./useOrganizationStore";
import { useSubOrganizationStore } from "./useSubOrganizationStore";
import type { WhatsappSettings } from "../types/database";

type WhatsappSettingsState = {
  settings: WhatsappSettings | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  success: string | null;

  /**
   * true = using ORG-LEVEL settings because sub-org has no override
   */
  isOrgFallback: boolean;

  fetchSettings: () => Promise<void>;
  saveSettings: (params: {
    phone_number: string | null;
    api_token: string | null;
    whatsapp_phone_id: string | null;
    whatsapp_business_id: string | null;
    is_active: boolean;
  }) => Promise<void>;

  clearError: () => void;
  clearSuccess: () => void;
};

function normalizeSettings(raw: any | null): WhatsappSettings | null {
  if (!raw) return null;

  return {
    ...raw,
    phone_number: raw.phone_number ?? "",
    api_token: raw.api_token ?? "",
    whatsapp_phone_id: raw.whatsapp_phone_id ?? "",
    whatsapp_business_id: raw.whatsapp_business_id ?? "",
    is_active: raw.is_active ?? true,
  } as WhatsappSettings;
}

export const useWhatsappSettingsStore = create<WhatsappSettingsState>(
  (set, get) => ({
    settings: null,
    loading: false,
    saving: false,
    error: null,
    success: null,
    isOrgFallback: false,

    clearError: () => set({ error: null }),
    clearSuccess: () => set({ success: null }),

    /* =====================================================================================
       FETCH SETTINGS (sub-org override → org fallback)
    ====================================================================================== */
    fetchSettings: async () => {
      const { currentOrganization } = useOrganizationStore.getState();
      const { activeSubOrg } = useSubOrganizationStore.getState();

      if (!currentOrganization) {
        set({
          error: "Select an organization to configure WhatsApp settings.",
          settings: null,
          isOrgFallback: false,
        });
        return;
      }

      set({ loading: true, error: null });

      try {
        const orgId = currentOrganization.id;
        const subOrgId = activeSubOrg?.id ?? null;

        /* ---------- SUB-ORG ---------- */
        if (subOrgId) {
          const { data: subData } = await supabase
            .from("whatsapp_settings")
            .select("*")
            .eq("organization_id", orgId)
            .eq("sub_organization_id", subOrgId)
            .maybeSingle();

          if (subData) {
            set({
              loading: false,
              settings: normalizeSettings(subData),
              isOrgFallback: false,
            });
            return;
          }

          const { data: orgData } = await supabase
            .from("whatsapp_settings")
            .select("*")
            .eq("organization_id", orgId)
            .is("sub_organization_id", null)
            .maybeSingle();

          if (orgData) {
            set({
              loading: false,
              settings: normalizeSettings(orgData),
              isOrgFallback: true,
            });
            return;
          }

          set({ loading: false, settings: null, isOrgFallback: false });
          return;
        }

        /* ---------- ORG ---------- */
        const { data } = await supabase
          .from("whatsapp_settings")
          .select("*")
          .eq("organization_id", currentOrganization.id)
          .is("sub_organization_id", null)
          .maybeSingle();

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
          error: err?.message ?? "Unexpected error while loading settings.",
        });
      }
    },

    /* =====================================================================================
       SAVE SETTINGS
    ====================================================================================== */
    saveSettings: async ({
      phone_number,
      api_token,
      whatsapp_phone_id,
      whatsapp_business_id,
      is_active,
    }) => {
      const { currentOrganization } = useOrganizationStore.getState();
      const { activeSubOrg } = useSubOrganizationStore.getState();
      const { settings } = get();

      if (!currentOrganization) {
        set({ error: "Select an organization before saving settings." });
        return;
      }

      set({ saving: true, error: null, success: null });

      try {
        const payload: any = {
          organization_id: currentOrganization.id,
          sub_organization_id: activeSubOrg?.id ?? null,
          phone_number,
          api_token,
          whatsapp_phone_id,
          whatsapp_business_id,
          is_active,
        };

        if (
          settings &&
          settings.organization_id === payload.organization_id &&
          settings.sub_organization_id === payload.sub_organization_id
        ) {
          payload.id = settings.id;
        }

        const { data, error } = await supabase
          .from("whatsapp_settings")
          .upsert(payload, {
            onConflict: "organization_id,sub_organization_id",
          })
          .select("*")
          .single();

        if (error) {
          set({ saving: false, error: error.message });
          return;
        }

        set({
          saving: false,
          settings: normalizeSettings(data),
          success: "WhatsApp settings saved successfully!",
          isOrgFallback: false,
        });

        setTimeout(() => {
          if (get().success) set({ success: null });
        }, 2000);
      } catch (err: any) {
        set({
          saving: false,
          error: err?.message ?? "Unexpected error while saving settings.",
        });
      }
    },
  }),
);
