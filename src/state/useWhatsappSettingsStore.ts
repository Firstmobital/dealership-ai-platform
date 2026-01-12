import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";
import { useOrganizationStore } from "./useOrganizationStore";
import type { WhatsappSettings } from "../types/database";

type WhatsappSettingsState = {
  settings: WhatsappSettings | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  success: string | null;

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

  reset: () => void;
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

    /* ======================================================
       FETCH SETTINGS (ORG ONLY)
    ====================================================== */
    fetchSettings: async () => {
      const { activeOrganization } = useOrganizationStore.getState();

      if (!activeOrganization?.id) {
        set({
          error: "Select an organization to configure WhatsApp settings.",
          settings: null,
        });
        return;
      }

      set({ loading: true, error: null });

      try {
        const { data, error } = await supabase
          .from("whatsapp_settings")
          .select("*")
          .eq("organization_id", activeOrganization.id)
          .maybeSingle();

        if (error) {
          set({
            loading: false,
            error: error.message,
            settings: null,
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
          error: err?.message ?? "Unexpected error while loading settings.",
        });
      }
    },

    /* ======================================================
       SAVE SETTINGS (UPSERT BY ORGANIZATION)
    ====================================================== */
    saveSettings: async ({
      phone_number,
      api_token,
      whatsapp_phone_id,
      whatsapp_business_id,
      is_active,
    }) => {
      const { activeOrganization } = useOrganizationStore.getState();

      if (!activeOrganization?.id) {
        set({ error: "Select an organization before saving settings." });
        return;
      }

      set({ saving: true, error: null, success: null });

      try {
        const payload = {
          organization_id: activeOrganization.id,
          phone_number,
          api_token,
          whatsapp_phone_id,
          whatsapp_business_id,
          is_active,
        };

        const { data, error } = await supabase
          .from("whatsapp_settings")
          .upsert(payload, {
            onConflict: "organization_id",
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
