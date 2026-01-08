import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";
import type { Organization } from "../types/database";

/* ============================================================================
   TYPES
============================================================================ */
type OrgWithMeta = Organization & {
  last_active_at: string | null;
};

export type OrgState = {
  /* -------------------------------------------------------------------------- */
  /* DATA                                                                       */
  /* -------------------------------------------------------------------------- */
  organizations: OrgWithMeta[];
  activeOrganization: Organization | null;

  isBootstrapping: boolean;
  /** True once bootstrapOrganizations has completed at least once (success or empty). */
  initialized: boolean;
  loading: boolean;

  /* -------------------------------------------------------------------------- */
  /* ACTIONS                                                                    */
  /* -------------------------------------------------------------------------- */
  bootstrapOrganizations: () => Promise<void>;
  setActiveOrganization: (org: Organization) => Promise<void>;
  /** Admin helper: create a new org + membership and switch into it. */
  createOrganization: (name: string) => Promise<void>;
  clearOrganizationState: () => void;
};

/* ============================================================================
   STORE
============================================================================ */
export const useOrganizationStore = create<OrgState>((set, get) => ({
  /* -------------------------------------------------------------------------- */
  /* INITIAL STATE                                                              */
  /* -------------------------------------------------------------------------- */
  organizations: [],
  activeOrganization: null,

  isBootstrapping: false,
  initialized: false,
  loading: false,

  /* -------------------------------------------------------------------------- */
  /* BOOTSTRAP (CALLED ON APP LOAD AFTER LOGIN)                                  */
  /* -------------------------------------------------------------------------- */
  bootstrapOrganizations: async () => {
    set({ isBootstrapping: true, loading: true });

    const {
      data: memberships,
      error,
    } = await supabase
      .from("organization_users")
      .select(
        `
        last_active_at,
        organizations (*)
      `
      );

    if (error) {
      console.error("[Org] bootstrap error:", error);
      set({ isBootstrapping: false, loading: false, initialized: true });
      return;
    }

    const orgs: OrgWithMeta[] =
      memberships
        ?.map((m: any) => ({
          ...m.organizations,
          last_active_at: m.last_active_at,
        }))
        .filter(Boolean) ?? [];

    if (orgs.length === 0) {
      // User has no organizations
      set({
        organizations: [],
        activeOrganization: null,
        isBootstrapping: false,
        loading: false,
        initialized: true,
      });
      return;
    }

    // Pick last-used org
    const sorted = [...orgs].sort((a, b) => {
      if (!a.last_active_at && !b.last_active_at) return 0;
      if (!a.last_active_at) return 1;
      if (!b.last_active_at) return -1;
      return (
        new Date(b.last_active_at).getTime() -
        new Date(a.last_active_at).getTime()
      );
    });

    const selected = sorted[0];

    await get().setActiveOrganization(selected);

    set({
      organizations: orgs,
      isBootstrapping: false,
      loading: false,
      initialized: true,
    });
  },

  /* -------------------------------------------------------------------------- */
  /* ACTIVATE ORGANIZATION (AUTO OR MANUAL)                                      */
  /* -------------------------------------------------------------------------- */
  setActiveOrganization: async (org: Organization) => {
    set({ activeOrganization: org });

    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;

    const { error } = await supabase
      .from("organization_users")
      .update({
        last_active_at: new Date().toISOString(),
      })
      .eq("organization_id", org.id)
      .eq("user_id", user.id);

    if (error) {
      console.error("[Org] failed to update last_active_at:", error);
    }
  },

  /* -------------------------------------------------------------------------- */
  /* CREATE ORGANIZATION (ADMIN)                                                 */
  /* -------------------------------------------------------------------------- */
  createOrganization: async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) throw new Error("Not authenticated");

    // 1) Create org
    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .insert({ name: trimmed })
      .select("*")
      .single();

    if (orgErr) {
      console.error("[Org] create org failed:", orgErr);
      throw orgErr;
    }

    // 2) Create membership
    const { error: mErr } = await supabase.from("organization_users").insert({
      organization_id: org.id,
      user_id: user.id,
      role: "admin",
      last_active_at: new Date().toISOString(),
    });

    if (mErr) {
      console.error("[Org] create membership failed:", mErr);
      throw mErr;
    }

    // 3) Refresh + switch
    await get().bootstrapOrganizations();
    await get().setActiveOrganization(org);
  },

  /* -------------------------------------------------------------------------- */
  /* CLEAR STATE (LOGOUT)                                                        */
  /* -------------------------------------------------------------------------- */
  clearOrganizationState: () => {
    set({
      organizations: [],
      activeOrganization: null,
      isBootstrapping: false,
      initialized: false,
      loading: false,
    });
  },
}));
