import { create } from "zustand";
import type { WhatsappSettings } from "../types/database";
import {
  fetchWhatsappSettings,
  upsertWhatsappSettings,
} from "../lib/api/whatsapp";

type WhatsappSettingsState = {
  settings: WhatsappSettings | null;
  loading: boolean;
  error: string | null;

  loadSettings: (organizationId: string) => Promise<void>;
  saveSettings: (
    organizationId: string,
    values: Partial<WhatsappSettings>
  ) => Promise<void>;
};

export const useWhatsappSettingsStore = create<WhatsappSettingsState>(
  (set) => ({
    settings: null,
    loading: false,
    error: null,

    // -------------------------------------------------------------
    // LOAD SETTINGS FOR SELECTED ORGANIZATION
    // -------------------------------------------------------------
    loadSettings: async (organizationId: string) => {
      set({ loading: true, error: null });

      try {
        const data = await fetchWhatsappSettings(organizationId);

        // Normalize shape if needed
        const normalized: WhatsappSettings = {
          ...data,
          phone_number: data.phone_number ?? "",
          api_token: data.api_token ?? "",
          verify_token: data.verify_token ?? "",
          whatsapp_phone_id: data.whatsapp_phone_id ?? "",
          whatsapp_business_id: data.whatsapp_business_id ?? "",
          is_active: data.is_active ?? true,
        };

        set({ settings: normalized, loading: false });
      } catch (err: any) {
        set({
          loading: false,
          error: err?.message ?? "Failed to load WhatsApp settings",
        });
        throw err;
      }
    },

    // -------------------------------------------------------------
    // SAVE SETTINGS (UPSERT)
    // -------------------------------------------------------------
    saveSettings: async (organizationId: string, values) => {
      set({ loading: true, error: null });

      try {
        const data = await upsertWhatsappSettings(organizationId, values);

        const normalized: WhatsappSettings = {
          ...data,
          phone_number: data.phone_number ?? "",
          api_token: data.api_token ?? "",
          verify_token: data.verify_token ?? "",
          whatsapp_phone_id: data.whatsapp_phone_id ?? "",
          whatsapp_business_id: data.whatsapp_business_id ?? "",
          is_active: data.is_active ?? true,
        };

        set({ settings: normalized, loading: false });
      } catch (err: any) {
        console.error("[WA-SETTINGS] Save error:", err);

        set({
          loading: false,
          error: err?.message ?? "Failed to save WhatsApp settings",
        });

        throw err;
      }
    },
  })
);
