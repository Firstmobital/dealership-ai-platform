import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";
import type { SubOrganization } from "../types/database";

type SubOrgState = {
  subOrgs: SubOrganization[];
  loading: boolean;
  fetchSubOrgs: (organizationId: string) => Promise<void>;
  createSubOrg: (args: {
    organization_id: string;
    name: string;
    slug?: string;
    description?: string;
  }) => Promise<void>;
};

export const useSubOrganizationStore = create<SubOrgState>((set, get) => ({
  subOrgs: [],
  loading: false,

  fetchSubOrgs: async (organizationId) => {
    set({ loading: true });
    const { data, error } = await supabase
      .from("sub_organizations")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[useSubOrganizationStore] fetchSubOrgs error", error);
    }

    set({ subOrgs: data ?? [], loading: false });
  },

  createSubOrg: async ({ organization_id, name, slug, description }) => {
    const finalSlug =
      slug?.trim() ||
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

    const { data, error } = await supabase
      .from("sub_organizations")
      .insert({
        organization_id,
        name,
        slug: finalSlug,
        description,
      })
      .select()
      .single();

    if (error) {
      console.error("[useSubOrganizationStore] createSubOrg error", error);
      throw error;
    }

    set((state) => ({
      subOrgs: [...state.subOrgs, data],
    }));
  },
}));
