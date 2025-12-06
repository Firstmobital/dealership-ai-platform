import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";
import type { Organization, SubOrganization } from "../types/database";

type OrganizationState = {
  // Parent orgs list
  organizations: Organization[];

  // Sub-orgs list for the selected parent org
  subOrganizations: SubOrganization[];

  // Currently active org and sub-org
  currentOrganization: Organization | null;
  currentSubOrganization: SubOrganization | null;

  // Load state
  loading: boolean;

  /*
   * Load all orgs where user is a member
   */
  fetchOrganizations: () => Promise<void>;

  /*
   * Load sub-orgs (divisions) for selected organization
   */
  fetchSubOrganizations: (orgId: string) => Promise<void>;

  /*
   * Switch active parent organization
   */
  switchOrganization: (orgId: string | null) => void;

  /*
   * Switch active sub-organization
   */
  switchSubOrganization: (subOrgId: string | null) => void;
};

export const useOrganizationStore = create<OrganizationState>((set, get) => ({
  organizations: [],
  subOrganizations: [],

  currentOrganization: null,
  currentSubOrganization: null,

  loading: false,

  // -----------------------------
  // LOAD ALL ORGANIZATIONS
  // -----------------------------
  fetchOrganizations: async () => {
    set({ loading: true });

    const { data, error } = await supabase
      .from("organizations")
      .select("*")
      .order("name", { ascending: true });

    if (!error && data) {
      set({ organizations: data });
    }

    set({ loading: false });
  },

  // -----------------------------
  // LOAD SUB-ORGS FOR ORG
  // -----------------------------
  fetchSubOrganizations: async (orgId: string) => {
    if (!orgId) return;

    set({ loading: true });

    const { data, error } = await supabase
      .from("sub_organizations")
      .select("*")
      .eq("organization_id", orgId)
      .order("name", { ascending: true });

    if (!error && data) {
      set({ subOrganizations: data });
    }

    set({ loading: false });
  },

  // -----------------------------
  // SWITCH ACTIVE ORGANIZATION
  // -----------------------------
  switchOrganization: (orgId: string | null) => {
    if (!orgId) {
      set({
        currentOrganization: null,
        subOrganizations: [],
        currentSubOrganization: null,
      });
      return;
    }

    const org =
      get().organizations.find((o) => o.id === orgId) ?? null;

    set({ currentOrganization: org });

    // Reset active sub-org when org changes
    set({ currentSubOrganization: null });
  },

  // -----------------------------
  // SWITCH ACTIVE SUB-ORGANIZATION
  // -----------------------------
  switchSubOrganization: (subOrgId: string | null) => {
    if (!subOrgId) {
      set({ currentSubOrganization: null });
      return;
    }

    const subOrg =
      get().subOrganizations.find((s) => s.id === subOrgId) ?? null;

    set({ currentSubOrganization: subOrg });
  },
}));
