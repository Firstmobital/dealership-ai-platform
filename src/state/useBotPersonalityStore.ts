import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";
import { useOrganizationStore } from "./useOrganizationStore";
import { useSubOrganizationStore } from "./useSubOrganizationStore";

type BotPersonalityState = {
  loading: boolean;
  saving: boolean;
  error: string | null;

  personality: any | null;
  instructions: any | null;

  fetchPersonality: () => Promise<void>;
  savePersonality: (data: any) => Promise<void>;
};

export const useBotPersonalityStore = create<BotPersonalityState>((set) => ({
  loading: false,
  saving: false,
  error: null,

  personality: null,
  instructions: null,

  async fetchPersonality() {
    set({ loading: true, error: null });

    const org = useOrganizationStore.getState().currentOrganization;
    const sub = useSubOrganizationStore.getState().activeSubOrg;

    if (!org?.id) return;

    const q = supabase
      .from("bot_personality")
      .select("*")
      .eq("organization_id", org.id);

    const { data } = sub?.id
      ? await q.eq("sub_organization_id", sub.id).maybeSingle()
      : await q.is("sub_organization_id", null).maybeSingle();

    const rulesQ = supabase
      .from("bot_instructions")
      .select("*")
      .eq("organization_id", org.id);

    const { data: rules } = sub?.id
      ? await rulesQ.eq("sub_organization_id", sub.id).maybeSingle()
      : await rulesQ.is("sub_organization_id", null).maybeSingle();

    set({
      personality: data ?? {},
      instructions: rules ?? { rules: {} },
      loading: false,
    });
  },

  async savePersonality(payload) {
    set({ saving: true, error: null });

    const org = useOrganizationStore.getState().currentOrganization;
    const sub = useSubOrganizationStore.getState().activeSubOrg;

    if (!org?.id) return;

    await supabase.from("bot_personality").upsert({
      organization_id: org.id,
      sub_organization_id: sub?.id ?? null,
      ...payload.personality,
    });

    await supabase.from("bot_instructions").upsert({
      organization_id: org.id,
      sub_organization_id: sub?.id ?? null,
      rules: payload.instructions,
    });

    set({ saving: false });
  },
}));
