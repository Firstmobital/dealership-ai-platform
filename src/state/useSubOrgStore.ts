import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";

export type SubOrg = {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
};

type SubOrgState = {
  loading: boolean;
  list: SubOrg[];
  active: SubOrg | null;

  fetchSubOrgs: (organizationId: string) => Promise<void>;
  setActive: (subOrg: SubOrg | null) => void;
};

export const useSubOrgStore = create<SubOrgState>((set, get) => ({
  loading: false,
  list: [],
  active: null,

  fetchSubOrgs: async (organizationId: string) => {
    set({ loading: true });

    const { data, error } = await supabase
      .from("sub_organizations")
      .select("*")
      .eq("organization_id", organizationId)
      .order("name");

    if (!error && data) {
      set({ list: data });
      // default active = General (slug = "general")
      const general = data.find((d) => d.slug === "general");
      set({ active: general ?? null });
    }

    set({ loading: false });
  },

  setActive: (subOrg) => set({ active: subOrg }),
}));
