import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";
import { useOrganizationStore } from "./useOrganizationStore";
import type { BotPersonality } from "../types/database";

type BotPersonalityState = {
  personality: BotPersonality | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  success: string | null;

  fetchPersonality: () => Promise<void>;
  savePersonality: (params: {
    system_prompt: string;
    greeting_message: string;
    fallback_message: string;
    language: string;
    tone: string;
  }) => Promise<void>;

  clearError: () => void;
  clearSuccess: () => void;

  reset: () => void;
};

export const useBotPersonalityStore = create<BotPersonalityState>((set, get) => ({
  personality: null,
  loading: false,
  saving: false,
  error: null,
  success: null,

  reset: () =>
    set({
      personality: null,
      loading: false,
      saving: false,
      error: null,
      success: null,
    }),

  clearError: () => set({ error: null }),
  clearSuccess: () => set({ success: null }),

  /* ---------------------------------------------------------
     FETCH BOT PERSONALITY (ORG ONLY)
  --------------------------------------------------------- */
  fetchPersonality: async () => {
    const { activeOrganization } = useOrganizationStore.getState();

    if (!activeOrganization?.id) {
      set({
        error: "Select an organization to configure bot personality.",
        personality: null,
      });
      return;
    }

    set({ loading: true, error: null });

    try {
      const { data, error } = await supabase
        .from("bot_personality")
        .select("*")
        .eq("organization_id", activeOrganization.id)
        .maybeSingle();

      if (error) {
        set({
          loading: false,
          personality: null,
          error: error.message,
        });
        return;
      }

      set({
        loading: false,
        personality: data ?? null,
      });
    } catch (err: any) {
      set({
        loading: false,
        personality: null,
        error:
          err?.message ??
          "Unexpected error while loading bot personality.",
      });
    }
  },

  /* ---------------------------------------------------------
     SAVE BOT PERSONALITY (UPSERT BY ORGANIZATION)
  --------------------------------------------------------- */
  savePersonality: async ({
    system_prompt,
    greeting_message,
    fallback_message,
    language,
    tone,
  }) => {
    const { activeOrganization } = useOrganizationStore.getState();

    if (!activeOrganization?.id) {
      set({ error: "Select an organization before saving bot personality." });
      return;
    }

    set({ saving: true, error: null, success: null });

    try {
      const payload = {
        organization_id: activeOrganization.id,
        system_prompt,
        greeting_message,
        fallback_message,
        language,
        tone,
      };

      const { data, error } = await supabase
        .from("bot_personality")
        .upsert(payload, { onConflict: "organization_id" })
        .select("*")
        .single();

      if (error) {
        set({ saving: false, error: error.message });
        return;
      }

      set({
        saving: false,
        personality: data,
        success: "Bot personality saved successfully!",
      });

      setTimeout(() => {
        if (get().success) set({ success: null });
      }, 2000);
    } catch (err: any) {
      set({
        saving: false,
        error:
          err?.message ??
          "Unexpected error while saving bot personality.",
      });
    }
  },
}));