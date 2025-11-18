import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";

export type WhatsappSettings = {
  id: string;
  organization_id: string;
  phone_number: string | null;
  api_token: string | null;
  verify_token: string | null;
  whatsapp_phone_id: string | null;
  whatsapp_business_id: string | null;
  created_at?: string;
};

type State = {
  settings: WhatsappSettings | null;
  loading: boolean;

  loadSettings: (organization_id: string) => Promise<void>;
  saveSettings: (
    organization_id: string,
    values: Partial<WhatsappSettings>
  ) => Promise<void>;
};

export const useWhatsappSettingsStore = create<State>((set, get) => ({
  settings: null,
  loading: false,

  loadSettings: async (organization_id: string) => {
    set({ loading: true });

    const { data, error } = await supabase
      .from("whatsapp_settings")
      .select("*")
      .eq("organization_id", organization_id)
      .maybeSingle();

    if (error) {
      console.error("[WA-SETTINGS] Load error:", error);
    }

    set({ settings: data, loading: false });
  },

  saveSettings: async (organization_id: string, values) => {
    set({ loading: true });

    const { data, error } = await supabase
      .from("whatsapp_settings")
      .upsert(
        {
          organization_id,
          ...values,
        },
        { onConflict: "organization_id" }
      )
      .select()
      .maybeSingle();

    if (error) {
      console.error("[WA-SETTINGS] Save error:", error);
    }

    set({ settings: data, loading: false });
  },
}));
