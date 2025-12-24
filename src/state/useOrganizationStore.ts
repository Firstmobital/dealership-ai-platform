// src/state/useOrganizationStore.ts
import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";
import type { Organization, SubOrganization } from "../types/database";

/* ============================================================================
   TYPES
============================================================================ */
export type OrgState = {
  /* -------------------------------------------------------------------------- */
  /* DATA                                                                       */
  /* -------------------------------------------------------------------------- */
  organizations: Organization[];
  subOrganizations: SubOrganization[];

  currentOrganization: Organization | null;
  currentSubOrganization: SubOrganization | null;

  selectedOrganizationId: string | null;
  selectedSubOrganizationId: string | null;

  loading: boolean;
  initialized: boolean;

  /* -------------------------------------------------------------------------- */
  /* ACTIONS                                                                    */
  /* -------------------------------------------------------------------------- */
  fetchOrganizations: () => Promise<void>;
  fetchSubOrganizations: (orgId: string) => Promise<void>;
  switchOrganization: (orgId: string | null) => void;
  switchSubOrganization: (subOrgId: string | null) => void;

  hydrate: () => void;
  loadAll: () => Promise<void>;
};

/* ============================================================================
   STORE
============================================================================ */
export const useOrganizationStore = create<OrgState>((set, get) => ({
  /* -------------------------------------------------------------------------- */
  /* INITIAL STATE                                                              */
  /* -------------------------------------------------------------------------- */
  organizations: [],
  subOrganizations: [],

  currentOrganization: null,
  currentSubOrganization: null,

  selectedOrganizationId: null,
  selectedSubOrganizationId: null,

  loading: false,
  initialized: false,

  /* -------------------------------------------------------------------------- */
  /* HYDRATION                                                                  */
  /* -------------------------------------------------------------------------- */
  hydrate: () => {
    const orgId = localStorage.getItem("selectedOrgId");
    const subOrgId = localStorage.getItem("selectedSubOrgId");

    set({
      selectedOrganizationId: orgId || null,
      selectedSubOrganizationId: subOrgId || null,
    });
  },

  /* -------------------------------------------------------------------------- */
  /* LOAD ALL (ORG → SUB ORG)                                                    */
  /* -------------------------------------------------------------------------- */
  loadAll: async () => {
    get().hydrate();
    await get().fetchOrganizations();

    const org = get().currentOrganization;
    if (org?.id) {
      await get().fetchSubOrganizations(org.id);
    }

    set({ initialized: true });
  },

  /* -------------------------------------------------------------------------- */
  /* FETCH ORGANIZATIONS                                                        */
  /* -------------------------------------------------------------------------- */
  fetchOrganizations: async () => {
    set({ loading: true });

    const { data, error } = await supabase
      .from("organizations")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      console.error("[Org] fetchOrganizations error:", error);
      set({ loading: false });
      return;
    }

    const organizations = data ?? [];

    const storedId = localStorage.getItem("selectedOrgId");
    let selectedId = get().selectedOrganizationId || storedId || null;

    if (!selectedId && organizations.length > 0) {
      selectedId = organizations[0].id;
    }

    const currentOrganization =
      selectedId
        ? organizations.find((o) => o.id === selectedId) ?? null
        : null;

    if (currentOrganization) {
      localStorage.setItem("selectedOrgId", currentOrganization.id);
    }

    set({
      organizations,
      currentOrganization,
      selectedOrganizationId: currentOrganization?.id ?? null,
      loading: false,
    });
  },

  /* -------------------------------------------------------------------------- */
  /* FETCH SUB ORGANIZATIONS                                                     */
  /* -------------------------------------------------------------------------- */
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

    const subOrganizations = data ?? [];

    const storedId = localStorage.getItem("selectedSubOrgId");
    let selectedId = get().selectedSubOrganizationId || storedId || null;

    if (!selectedId && subOrganizations.length > 0) {
      selectedId = subOrganizations[0].id;
    }

    const currentSubOrganization =
      selectedId
        ? subOrganizations.find((s) => s.id === selectedId) ?? null
        : null;

    if (currentSubOrganization) {
      localStorage.setItem("selectedSubOrgId", currentSubOrganization.id);
    }

    set({
      subOrganizations,
      currentSubOrganization,
      selectedSubOrganizationId: currentSubOrganization?.id ?? null,
      loading: false,
    });
  },

  /* -------------------------------------------------------------------------- */
  /* SWITCH ORGANIZATION                                                        */
  /* -------------------------------------------------------------------------- */
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
      currentSubOrganization: null,
      selectedSubOrganizationId: null,
      subOrganizations: [],
    });

    if (org?.id) {
      get().fetchSubOrganizations(org.id);
    }
  },

  /* -------------------------------------------------------------------------- */
  /* SWITCH SUB ORGANIZATION                                                     */
  /* -------------------------------------------------------------------------- */
  switchSubOrganization: (subOrgId: string | null) => {
    if (!subOrgId) {
      localStorage.removeItem("selectedSubOrgId");
      set({
        currentSubOrganization: null,
        selectedSubOrganizationId: null,
      });
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
