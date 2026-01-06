import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";
import type { Organization } from "../types/database";

/* ============================================================================
   TYPES
============================================================================ */
export type OrgState = {
  /* -------------------------------------------------------------------------- */
  /* DATA                                                                       */
  /* -------------------------------------------------------------------------- */
  organizations: Organization[];

  currentOrganization: Organization | null;
  selectedOrganizationId: string | null;

  loading: boolean;
  initialized: boolean;

  /* -------------------------------------------------------------------------- */
  /* ACTIONS                                                                    */
  /* -------------------------------------------------------------------------- */
  fetchOrganizations: () => Promise<void>;
  switchOrganization: (orgId: string | null) => void;

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

  currentOrganization: null,
  selectedOrganizationId: null,

  loading: false,
  initialized: false,

  /* -------------------------------------------------------------------------- */
  /* HYDRATION                                                                  */
  /* -------------------------------------------------------------------------- */
  hydrate: () => {
    const orgId = localStorage.getItem("selectedOrgId");

    set({
      selectedOrganizationId: orgId || null,
    });
  },

  /* -------------------------------------------------------------------------- */
  /* LOAD ALL                                                                   */
  /* -------------------------------------------------------------------------- */
  loadAll: async () => {
    get().hydrate();
    await get().fetchOrganizations();
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
  /* SWITCH ORGANIZATION                                                        */
  /* -------------------------------------------------------------------------- */
  switchOrganization: (orgId: string | null) => {
    if (!orgId) {
      localStorage.removeItem("selectedOrgId");

      set({
        currentOrganization: null,
        selectedOrganizationId: null,
      });
      return;
    }

    localStorage.setItem("selectedOrgId", orgId);

    const org =
      get().organizations.find((o) => o.id === orgId) ?? null;

    set({
      currentOrganization: org,
      selectedOrganizationId: org?.id ?? null,
    });
  },
}));
