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

  loadSettings: (
    organizationId: string,
    subOrganizationId: string | null
  ) => Promise<void>;

  saveSettings: (
    organizationId: string,
    subOrganizationId: string | null,
    values: Partial<WhatsappSettings>
  ) => Promise<void>;
};

export const useWhatsappSettingsStore = create<WhatsappSettingsState>(
  (set) => ({
    settings: null,
    loading: false,
    error: null,

    // -------------------------------------------------------------
    // LOAD SETTINGS FOR ORG + SUB-ORG
    // -------------------------------------------------------------
    loadSettings: async (
      organizationId: string,
      subOrganizationId: string | null
    ) => {
      set({ loading: true, error: null });

      try {
        const data = await fetchWhatsappSettings(
          organizationId,
          subOrganizationId
        );

        if (!data) {
          // No row yet for this org + sub-org → keep settings null,
          // the UI will show an empty form.
          set({ settings: null, loading: false });
          return;
        }

        const normalized: WhatsappSettings = {
          ...data,
          organization_id: data.organization_id ?? organizationId,
          sub_organization_id:
            data.sub_organization_id ?? subOrganizationId ?? null,
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
    // SAVE SETTINGS (UPSERT ORG + SUB-ORG)
    // -------------------------------------------------------------
    saveSettings: async (
      organizationId: string,
      subOrganizationId: string | null,
      values
    ) => {
      set({ loading: true, error: null });

      try {
        const data = await upsertWhatsappSettings(
          organizationId,
          subOrganizationId,
          values
        );

        const normalized: WhatsappSettings = {
          ...data,
          organization_id: data.organization_id ?? organizationId,
          sub_organization_id:
            data.sub_organization_id ?? subOrganizationId ?? null,
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
