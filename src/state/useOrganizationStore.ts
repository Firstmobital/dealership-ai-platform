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

  // ACTIONS
  fetchOrganizations: () => Promise<void>;
  fetchSubOrganizations: (organizationId: string) => Promise<void>;

  switchOrganization: (organizationId: string) => void;
  switchSubOrganization: (subOrgId: string | null) => void;
};

export const useOrganizationStore = create<OrganizationState>((set, get) => ({
  // -----------------------------
  // DEFAULT STATE
  // -----------------------------
  organizations: [],
  subOrganizations: [],
  currentOrganization: null,
  currentSubOrganization: null,
  loading: false,

  // -----------------------------
  // LOAD PARENT ORGANIZATIONS ONLY
  // -----------------------------
  fetchOrganizations: async () => {
    set({ loading: true });

    const { data, error } = await supabase
      .from("organizations")
      .select("*")
      .order("name");

    if (error) {
      console.error("[ORG] Error fetching organizations:", error);
      set({ loading: false });
      return;
    }

    const firstOrg = data?.[0] ?? null;

    set({
      organizations: data ?? [],
      currentOrganization: firstOrg,
      loading: false,
    });

    // Load sub-orgs for the default selected org
    if (firstOrg) {
      get().fetchSubOrganizations(firstOrg.id);
    }
  },

  // -----------------------------
  // LOAD SUB-ORGANIZATIONS FOR SELECTED ORG
  // -----------------------------
  fetchSubOrganizations: async (organizationId: string) => {
    const { data, error } = await supabase
      .from("sub_organizations")
      .select("*")
      .eq("organization_id", organizationId)
      .order("name");

    if (error) {
      console.error("[SUB-ORG] Error loading sub organizations:", error);
      return;
    }

    set({
      subOrganizations: data ?? [],
      currentSubOrganization: null, // reset on load
    });
  },

  // -----------------------------
  // SWITCH ACTIVE ORGANIZATION
  // -----------------------------
  switchOrganization: (organizationId: string) => {
    const org = get().organizations.find((o) => o.id === organizationId) ?? null;

    set({
      currentOrganization: org,
      currentSubOrganization: null, // reset sub-org
    });

    if (org) {
      get().fetchSubOrganizations(org.id);
    }
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
