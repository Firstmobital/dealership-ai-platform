import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";
import type { SubOrganization } from "../types/database";

type SubOrgState = {
  subOrgs: SubOrganization[]; // all divisions
  activeSubOrg: SubOrganization | null; // selected division
  loading: boolean;

  fetchSubOrgs: (organizationId: string) => Promise<void>;
  setActive: (subOrg: SubOrganization | null) => void;

  createSubOrg: (args: {
    organization_id: string;
    name: string;
    slug?: string;
    description?: string;
  }) => Promise<void>;
};

export const useSubOrganizationStore = create<SubOrgState>((set, get) => ({
  subOrgs: [],
  activeSubOrg: null,
  loading: false,

  /* -----------------------------------------------------
     Load all sub-orgs for an organization
  ----------------------------------------------------- */
  fetchSubOrgs: async (organizationId) => {
    set({ loading: true });

    const { data, error } = await supabase
      .from("sub_organizations")
      .select("*")
      .eq("organization_id", organizationId)
      .order("name");

    if (error) {
      console.error("[useSubOrganizationStore] fetchSubOrgs error", error);
      set({ loading: false });
      return;
    }

    set({ subOrgs: data ?? [], loading: false });

    // Pick General (default)
    const general = data?.find((d) => d.slug === "general") ?? null;
    set({ activeSubOrg: general });
  },

  /* -----------------------------------------------------
     Set active division (Sales, Service, etc.)
  ----------------------------------------------------- */
  setActive: (subOrg) => {
    set({ activeSubOrg: subOrg });
  },

  /* -----------------------------------------------------
     Create a new division (Sales, Service, Finance…)
  ----------------------------------------------------- */
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

    // Update state locally
    set((state) => ({
      subOrgs: [...state.subOrgs, data],
    }));
  },
}));
