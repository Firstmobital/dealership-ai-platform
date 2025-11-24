// src/state/useSubOrganizationStore.ts
import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";
import { useOrganizationStore } from "./useOrganizationStore";

export type SubOrganization = {
  id: string;
  organization_id: string;
  name: string;
  created_at: string;
};

type SubOrganizationState = {
  subOrgs: SubOrganization[];
  activeSubOrg: SubOrganization | null;
  loading: boolean;
  saving: boolean;
  error: string | null;

  fetchSubOrgs: (organizationId: string) => Promise<void>;
  createSubOrg: (name: string) => Promise<void>;
  updateSubOrg: (id: string, name: string) => Promise<void>;
  deleteSubOrg: (id: string) => Promise<void>;
  setActive: (subOrg: SubOrganization | null) => void;
  clearError: () => void;
};

export const useSubOrganizationStore = create<SubOrganizationState>(
  (set, get) => ({
    subOrgs: [],
    activeSubOrg: null,
    loading: false,
    saving: false,
    error: null,

    clearError: () => set({ error: null }),

    /**
     * Fetch sub-organizations for the active organization.
     */
    fetchSubOrgs: async (organizationId: string) => {
      if (!organizationId) {
        set({
          error: "Select an organization first.",
          subOrgs: [],
          activeSubOrg: null,
        });
        return;
      }

      set({ loading: true, error: null });

      try {
        const { data, error } = await supabase
          .from("sub_organizations")
          .select("*")
          .eq("organization_id", organizationId)
          .order("name", { ascending: true });

        if (error) {
          console.error("[SubOrg] fetch error:", error);
          set({
            loading: false,
            error: error.message ?? "Failed to load divisions.",
            subOrgs: [],
          });
          return;
        }

        const subOrgs = (data || []) as SubOrganization[];

        set({
          loading: false,
          error: null,
          subOrgs,
        });

        // If the active sub-org no longer exists, clear it
        const { activeSubOrg } = get();
        if (activeSubOrg && !subOrgs.find((s) => s.id === activeSubOrg.id)) {
          set({ activeSubOrg: null });
        }
      } catch (err: any) {
        console.error("[SubOrg] fetch exception:", err);
        set({
          loading: false,
          error: err?.message ?? "Unexpected error while loading divisions.",
          subOrgs: [],
        });
      }
    },

    /**
     * Create a new sub-organization.
     */
    createSubOrg: async (name: string) => {
      const { currentOrganization } = useOrganizationStore.getState();

      if (!currentOrganization) {
        set({ error: "Select an organization first." });
        return;
      }

      if (!name.trim()) {
        set({ error: "Division name cannot be empty." });
        return;
      }

      set({ saving: true, error: null });

      try {
        const { data, error } = await supabase
          .from("sub_organizations")
          .insert({
            name: name.trim(),
            organization_id: currentOrganization.id,
          })
          .select("*")
          .single();

        if (error) {
          console.error("[SubOrg] create error:", error);
          set({
            saving: false,
            error: error.message ?? "Failed to create division.",
          });
          return;
        }

        // Refresh list
        await get().fetchSubOrgs(currentOrganization.id);

        set({ saving: false, error: null });
      } catch (err: any) {
        console.error("[SubOrg] create exception:", err);
        set({
          saving: false,
          error: err?.message ?? "Unexpected error while creating division.",
        });
      }
    },

    /**
     * Update sub-organization name.
     */
    updateSubOrg: async (id: string, name: string) => {
      if (!name.trim()) {
        set({ error: "Division name cannot be empty." });
        return;
      }

      set({ saving: true, error: null });

      try {
        const { data, error } = await supabase
          .from("sub_organizations")
          .update({ name: name.trim() })
          .eq("id", id)
          .select("*")
          .single();

        if (error) {
          console.error("[SubOrg] update error:", error);
          set({
            saving: false,
            error: error.message ?? "Failed to update division.",
          });
          return;
        }

        // Refresh list
        const { currentOrganization } = useOrganizationStore.getState();
        await get().fetchSubOrgs(currentOrganization!.id);

        set({ saving: false, error: null });
      } catch (err: any) {
        console.error("[SubOrg] update exception:", err);
        set({
          saving: false,
          error: err?.message ?? "Unexpected error while updating division.",
        });
      }
    },

    /**
     * Delete a division.
     */
    deleteSubOrg: async (id: string) => {
      const { currentOrganization } = useOrganizationStore.getState();

      if (!currentOrganization) {
        set({ error: "Select an organization first." });
        return;
      }

      set({ saving: true, error: null });

      try {
        const { error } = await supabase
          .from("sub_organizations")
          .delete()
          .eq("id", id);

        if (error) {
          console.error("[SubOrg] delete error:", error);
          set({
            saving: false,
            error: error.message ?? "Failed to delete division.",
          });
          return;
        }

        await get().fetchSubOrgs(currentOrganization.id);

        // Clear active sub-org if deleted
        const { activeSubOrg } = get();
        if (activeSubOrg?.id === id) {
          set({ activeSubOrg: null });
        }

        set({ saving: false, error: null });
      } catch (err: any) {
        console.error("[SubOrg] delete exception:", err);
        set({
          saving: false,
          error: err?.message ?? "Unexpected error while deleting division.",
        });
      }
    },

    /**
     * Set active sub-org (null means organization-level context).
     */
    setActive: (subOrg) => {
      set({ activeSubOrg: subOrg });
    },
  })
);
