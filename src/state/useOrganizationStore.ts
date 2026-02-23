import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";
import type { Organization } from "../types/database";
import type { OrgRole } from "../auth/orgRoles";

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

  /** Current auth user's role in the active organization (organization_users.role). */
  currentUserRole: OrgRole | null;

  isBootstrapping: boolean;
  /** True once bootstrapOrganizations has completed at least once (success or empty). */
  initialized: boolean;
  loading: boolean;

  /* -------------------------------------------------------------------------- */
  /* ACTIONS                                                                    */
  /* -------------------------------------------------------------------------- */
  bootstrapOrganizations: () => Promise<void>;
  setActiveOrganization: (org: Organization) => Promise<void>;
  /** Fetch the current user's role for the active organization. */
  loadCurrentUserRole: () => Promise<void>;
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
  currentUserRole: null,

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
        currentUserRole: null,
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

    // Keep role in sync with active org.
    void get().loadCurrentUserRole();

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
  /* LOAD CURRENT USER ROLE                                                     */
  /* -------------------------------------------------------------------------- */
  loadCurrentUserRole: async () => {
    try {
      const orgId = get().activeOrganization?.id;
      if (!orgId) {
        set({ currentUserRole: null });
        return;
      }

      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id;
      if (!userId) {
        set({ currentUserRole: null });
        return;
      }

      const { data, error } = await supabase
        .from("organization_users")
        .select("role")
        .eq("organization_id", orgId)
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error("[Org] loadCurrentUserRole error:", error);
        set({ currentUserRole: null });
        return;
      }

      const role = String((data as any)?.role ?? "").trim().toLowerCase();
      set({ currentUserRole: (role || null) as OrgRole | null });
    } catch (e) {
      console.error("[Org] loadCurrentUserRole error:", e);
      set({ currentUserRole: null });
    }
  },

  /* -------------------------------------------------------------------------- */
  /* CREATE ORGANIZATION (ADMIN)                                                 */
  /* Uses Edge Function because `organizations` inserts are service-role only.   */
  /* -------------------------------------------------------------------------- */
  createOrganization: async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    const { data, error } = await supabase.functions.invoke("org-create", {
      body: { name: trimmed },
    });

    if (error) {
      console.error("[Org] org-create failed:", error);
      throw error;
    }

    const org = data?.organization;
    if (!org) throw new Error("Organization creation failed");

    // Refresh + switch
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
      currentUserRole: null,
      isBootstrapping: false,
      initialized: false,
      loading: false,
    });
  },
}));
