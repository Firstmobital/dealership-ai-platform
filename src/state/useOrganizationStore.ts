import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";
import type { Organization, SubOrganization } from "../types/database";

export type OrgState = {
  organizations: Organization[];
  subOrganizations: SubOrganization[];

  currentOrganization: Organization | null;
  currentSubOrganization: SubOrganization | null;

  selectedOrganizationId: string | null;
  selectedSubOrganizationId: string | null;

  loading: boolean;
  initialized: boolean;

  // Legacy API — MUST remain for build
  fetchOrganizations: () => Promise<void>;
  fetchSubOrganizations: (orgId: string) => Promise<void>;
  switchOrganization: (orgId: string | null) => void;
  switchSubOrganization: (subOrgId: string | null) => void;

  // Stage 6E-2 additions
  hydrate: () => void;
  loadAll: () => Promise<void>;
};

export const useOrganizationStore = create<OrgState>((set, get) => ({
  organizations: [],
  subOrganizations: [],

  currentOrganization: null,
  currentSubOrganization: null,

  selectedOrganizationId: null,
  selectedSubOrganizationId: null,

  loading: false,
  initialized: false,

  hydrate: () => {
    const orgId = localStorage.getItem("selectedOrgId");
    const subId = localStorage.getItem("selectedSubOrgId");

    set({
      selectedOrganizationId: orgId || null,
      selectedSubOrganizationId: subId || null,
    });
  },

  loadAll: async () => {
    await get().fetchOrganizations();

    const org = get().currentOrganization;
    if (org) {
      await get().fetchSubOrganizations(org.id);
    }

    set({ initialized: true });
  },

  fetchOrganizations: async () => {
    set({ loading: true });

    // Load all orgs
    const { data, error } = await supabase
      .from("organizations")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      console.error("[Org] fetchOrganizations error:", error);
      set({ loading: false });
      return;
    }

    const orgs = data ?? [];

    // Determine selected org
    const stored = localStorage.getItem("selectedOrgId");
    let selectedId = get().selectedOrganizationId || stored;

    if (!selectedId && orgs.length) selectedId = orgs[0].id;

    const activeOrg =
      selectedId ? orgs.find((o) => o.id === selectedId) ?? null : null;

    if (activeOrg) {
      localStorage.setItem("selectedOrgId", activeOrg.id);
    }

    set({
      organizations: orgs,
      currentOrganization: activeOrg,
      selectedOrganizationId: activeOrg ? activeOrg.id : null,
      loading: false,
    });
  },

  fetchSubOrganizations: async (orgId: string) => {
    if (!orgId) return;

    set({ loading: true });

    const { data, error } = await supabase
      .from("sub_organizations")
      .select("*")
      .eq("organization_id", orgId)
      .order("name", { ascending: true });

    if (error) {
      console.error("[Org] fetchSubOrganizations error:", error);
      set({ loading: false });
      return;
    }

    const subs = data ?? [];

    const stored = localStorage.getItem("selectedSubOrgId");
    let selectedId = get().selectedSubOrganizationId || stored;

    if (!selectedId && subs.length) selectedId = subs[0].id;

    const active =
      selectedId ? subs.find((s) => s.id === selectedId) ?? null : null;

    if (active) localStorage.setItem("selectedSubOrgId", active.id);

    set({
      subOrganizations: subs,
      currentSubOrganization: active,
      selectedSubOrganizationId: active ? active.id : null,
      loading: false,
    });
  },

  switchOrganization: (orgId: string | null) => {
    if (!orgId) {
      localStorage.removeItem("selectedOrgId");
      localStorage.removeItem("selectedSubOrgId");

      set({
        currentOrganization: null,
        currentSubOrganization: null,
        selectedOrganizationId: null,
        selectedSubOrganizationId: null,
        subOrganizations: [],
      });
      return;
    }

    localStorage.setItem("selectedOrgId", orgId);

    const org =
      get().organizations.find((o) => o.id === orgId) ?? null;

    set({
      currentOrganization: org,
      selectedOrganizationId: org?.id ?? null,
      selectedSubOrganizationId: null,
      currentSubOrganization: null,
      subOrganizations: [],
    });

    if (org) {
      get().fetchSubOrganizations(org.id);
    }
  },

  switchSubOrganization: (subOrgId: string | null) => {
    if (!subOrgId) {
      localStorage.removeItem("selectedSubOrgId");
      set({ currentSubOrganization: null, selectedSubOrganizationId: null });
      return;
    }

    localStorage.setItem("selectedSubOrgId", subOrgId);

    const sub =
      get().subOrganizations.find((s) => s.id === subOrgId) ?? null;

    set({
      currentSubOrganization: sub,
      selectedSubOrganizationId: sub?.id ?? null,
    });
  },
}));
