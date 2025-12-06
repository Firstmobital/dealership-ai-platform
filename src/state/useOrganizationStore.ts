// src/state/useOrganizationStore.ts
import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";

export type Organization = {
  id: string;
  name: string;
  created_at: string;
};

export type Division = {
  id: string;
  name: string;
  organization_id: string;
  created_at: string;
};

type OrgState = {
  organizations: Organization[];
  divisions: Division[];

  selectedOrgId: string | null;
  selectedDivisionId: string | null;

  loading: boolean;
  initialized: boolean;

  hydrate: () => void;
  loadAll: () => Promise<void>;
  setOrg: (id: string) => void;
  setDivision: (id: string) => void;

  currentOrg: () => Organization | null;
  currentDivision: () => Division | null;

  divisionsForSelectedOrg: () => Division[];
};

export const useOrganizationStore = create<OrgState>((set, get) => ({
  organizations: [],
  divisions: [],

  selectedOrgId: null,
  selectedDivisionId: null,

  loading: false,
  initialized: false,

  /* ----------------------------------------------------------
   *  (1) HYDRATE STORE FROM LOCALSTORAGE
   * -------------------------------------------------------- */
  hydrate: () => {
    const storedOrg = localStorage.getItem("selectedOrgId");
    const storedDiv = localStorage.getItem("selectedDivisionId");

    set({
      selectedOrgId: storedOrg || null,
      selectedDivisionId: storedDiv || null,
    });
  },

  /* ----------------------------------------------------------
   *  (2) LOAD ORGANIZATIONS + DIVISIONS
   * -------------------------------------------------------- */
  loadAll: async () => {
    set({ loading: true });

    // Load organizations (multi-tenant)
    const { data: orgs, error: orgErr } = await supabase
      .from("organizations")
      .select("*")
      .order("name", { ascending: true });

    // Load divisions (sub-orgs)
    const { data: divs, error: divErr } = await supabase
      .from("divisions")
      .select("*")
      .order("name", { ascending: true });

    set({ organizations: orgs ?? [], divisions: divs ?? [] });

    const state = get();

    /* ----------------------------------------------------------
     *  (A) AUTO-SELECT FIRST ORG IF NONE SELECTED
     * -------------------------------------------------------- */
    if (!state.selectedOrgId && orgs?.length) {
      const firstOrg = orgs[0].id;
      localStorage.setItem("selectedOrgId", firstOrg);
      set({ selectedOrgId: firstOrg });
    }

    /* ----------------------------------------------------------
     *  (B) AUTO-SELECT DIVISION BELONGING TO CURRENT ORG
     * -------------------------------------------------------- */
    const newState = get();
    const divisionsForThisOrg = divs?.filter(
      (d) => d.organization_id === newState.selectedOrgId
    );

    if (divisionsForThisOrg && divisionsForThisOrg.length > 0) {
      const stored = localStorage.getItem("selectedDivisionId");

      const stillValid = divisionsForThisOrg.some((d) => d.id === stored);

      if (!stored || !stillValid) {
        const fallback = divisionsForThisOrg[0].id;
        localStorage.setItem("selectedDivisionId", fallback);
        set({ selectedDivisionId: fallback });
      }
    } else {
      // org has zero divisions — clear division selection
      set({ selectedDivisionId: null });
      localStorage.removeItem("selectedDivisionId");
    }

    set({ loading: false, initialized: true });
  },

  /* ----------------------------------------------------------
   *  (3) SELECT ORGANIZATION
   * -------------------------------------------------------- */
  setOrg: (id) => {
    localStorage.setItem("selectedOrgId", id);
    set({ selectedOrgId: id });

    // Auto-update divisions
    const divs = get().divisions.filter((d) => d.organization_id === id);

    if (divs.length > 0) {
      localStorage.setItem("selectedDivisionId", divs[0].id);
      set({ selectedDivisionId: divs[0].id });
    } else {
      set({ selectedDivisionId: null });
      localStorage.removeItem("selectedDivisionId");
    }
  },

  /* ----------------------------------------------------------
   *  (4) SELECT DIVISION
   * -------------------------------------------------------- */
  setDivision: (id) => {
    localStorage.setItem("selectedDivisionId", id);
    set({ selectedDivisionId: id });
  },

  /* ----------------------------------------------------------
   *  (5) GETTERS
   * -------------------------------------------------------- */
  currentOrg: () => {
    const { organizations, selectedOrgId } = get();
    return organizations.find((o) => o.id === selectedOrgId) || null;
  },

  currentDivision: () => {
    const { divisions, selectedDivisionId } = get();
    return divisions.find((d) => d.id === selectedDivisionId) || null;
  },

  divisionsForSelectedOrg: () => {
    const { divisions, selectedOrgId } = get();
    if (!selectedOrgId) return [];
    return divisions.filter((d) => d.organization_id === selectedOrgId);
  },
}));
