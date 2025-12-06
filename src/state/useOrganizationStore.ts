import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";
import type { Organization, SubOrganization } from "../types/database";

type OrganizationState = {
  // Full lists
  organizations: Organization[];
  subOrganizations: SubOrganization[];

  // Currently active org and sub-org (objects)
  currentOrganization: Organization | null;
  currentSubOrganization: SubOrganization | null;

  // Internal selection IDs to support persistence
  selectedOrganizationId: string | null;
  selectedSubOrganizationId: string | null;

  // Load state
  loading: boolean;
  initialized: boolean;

  /*
   * Original APIs that the rest of your app already uses
   */
  fetchOrganizations: () => Promise<void>;
  fetchSubOrganizations: (orgId: string) => Promise<void>;
  switchOrganization: (orgId: string | null) => void;
  switchSubOrganization: (subOrgId: string | null) => void;

  /*
   * New helpers for app startup
   */
  hydrate: () => void;
  loadAll: () => Promise<void>;
};

export const useOrganizationStore = create<OrganizationState>((set, get) => ({
  organizations: [],
  subOrganizations: [],

  currentOrganization: null,
  currentSubOrganization: null,

  selectedOrganizationId: null,
  selectedSubOrganizationId: null,

  loading: false,
  initialized: false,

  // ---------------------------------------------------------------------------
  // Hydrate selection from localStorage (IDs only)
  // ---------------------------------------------------------------------------
  hydrate: () => {
    const storedOrgId = localStorage.getItem("selectedOrgId");
    const storedSubOrgId = localStorage.getItem("selectedSubOrgId");

    set({
      selectedOrganizationId: storedOrgId || null,
      selectedSubOrganizationId: storedSubOrgId || null,
    });
  },

  // ---------------------------------------------------------------------------
  // Load everything in one go (for App.tsx startup)
  // ---------------------------------------------------------------------------
  loadAll: async () => {
    await get().fetchOrganizations();

    const org = get().currentOrganization;
    if (org) {
      await get().fetchSubOrganizations(org.id);
    }

    set({ initialized: true });
  },

  // ---------------------------------------------------------------------------
  // LOAD ALL ORGANIZATIONS (used all over the app)
  // ---------------------------------------------------------------------------
  fetchOrganizations: async () => {
    set({ loading: true });

    const { selectedOrganizationId } = get();
    const storedOrgId =
      selectedOrganizationId || localStorage.getItem("selectedOrgId");

    const { data, error } = await supabase
      .from("organizations")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      console.error("[OrgStore] fetchOrganizations error:", error);
      set({ loading: false });
      return;
    }

    const orgs = data ?? [];
    let effectiveOrgId: string | null = storedOrgId ?? null;

    if (!effectiveOrgId && orgs.length > 0) {
      // if nothing in storage, pick first org
      effectiveOrgId = orgs[0].id;
    }

    const currentOrg =
      effectiveOrgId ? orgs.find((o) => o.id === effectiveOrgId) ?? null : null;

    if (currentOrg) {
      localStorage.setItem("selectedOrgId", currentOrg.id);
    } else {
      localStorage.removeItem("selectedOrgId");
    }

    set({
      organizations: orgs,
      currentOrganization: currentOrg,
      selectedOrganizationId: currentOrg ? currentOrg.id : null,
      loading: false,
    });
  },

  // ---------------------------------------------------------------------------
  // LOAD SUB-ORGS FOR ORG (divisions)
  // ---------------------------------------------------------------------------
  fetchSubOrganizations: async (orgId: string) => {
    if (!orgId) return;

    set({ loading: true });

    const { selectedSubOrganizationId } = get();
    const storedSubOrgId =
      selectedSubOrganizationId || localStorage.getItem("selectedSubOrgId");

    const { data, error } = await supabase
      .from("sub_organizations")
      .select("*")
      .eq("organization_id", orgId)
      .order("name", { ascending: true });

    if (error) {
      console.error("[OrgStore] fetchSubOrganizations error:", error);
      set({ loading: false });
      return;
    }

    const subs = data ?? [];
    let effectiveSubOrgId: string | null = storedSubOrgId ?? null;

    if (!effectiveSubOrgId && subs.length > 0) {
      // if nothing in storage, pick first sub-org for this org
      effectiveSubOrgId = subs[0].id;
    }

    const currentSubOrg =
      effectiveSubOrgId
        ? subs.find((s) => s.id === effectiveSubOrgId) ?? null
        : null;

    if (currentSubOrg) {
      localStorage.setItem("selectedSubOrgId", currentSubOrg.id);
    } else {
      localStorage.removeItem("selectedSubOrgId");
    }

    set({
      subOrganizations: subs,
      currentSubOrganization: currentSubOrg,
      selectedSubOrganizationId: currentSubOrg ? currentSubOrg.id : null,
      loading: false,
    });
  },

  // ---------------------------------------------------------------------------
  // SWITCH ACTIVE ORGANIZATION (used in UI switchers)
  // ---------------------------------------------------------------------------
  switchOrganization: (orgId: string | null) => {
    if (!orgId) {
      localStorage.removeItem("selectedOrgId");
      localStorage.removeItem("selectedSubOrgId");

      set({
        currentOrganization: null,
        selectedOrganizationId: null,
        subOrganizations: [],
        currentSubOrganization: null,
        selectedSubOrganizationId: null,
      });
      return;
    }

    const { organizations } = get();
    const org = organizations.find((o) => o.id === orgId) ?? null;

    if (!org) {
      console.warn("[OrgStore] switchOrganization: org not found for id", orgId);
      return;
    }

    localStorage.setItem("selectedOrgId", org.id);

    // When org changes, clear current sub-org selection
    localStorage.removeItem("selectedSubOrgId");

    set({
      currentOrganization: org,
      selectedOrganizationId: org.id,
      subOrganizations: [],
      currentSubOrganization: null,
      selectedSubOrganizationId: null,
    });

    // Load sub-orgs for the new org
    get().fetchSubOrganizations(org.id).catch((err) =>
      console.error("[OrgStore] switchOrganization -> fetchSubOrganizations error:", err)
    );
  },

  // ---------------------------------------------------------------------------
  // SWITCH ACTIVE SUB-ORGANIZATION (used in SubOrg switcher)
  // ---------------------------------------------------------------------------
  switchSubOrganization: (subOrgId: string | null) => {
    if (!subOrgId) {
      localStorage.removeItem("selectedSubOrgId");
      set({
        currentSubOrganization: null,
        selectedSubOrganizationId: null,
      });
      return;
    }

    const { subOrganizations } = get();
    const subOrg =
      subOrganizations.find((s) => s.id === subOrgId) ?? null;

    if (!subOrg) {
      console.warn(
        "[OrgStore] switchSubOrganization: sub org not found for id",
        subOrgId
      );
      return;
    }

    localStorage.setItem("selectedSubOrgId", subOrg.id);

    set({
      currentSubOrganization: subOrg,
      selectedSubOrganizationId: subOrg.id,
    });
  },
}));
