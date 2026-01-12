import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";
import { useOrganizationStore } from "./useOrganizationStore";
import type { WhatsappTemplate } from "../types/database";

type TemplateState = {
  templates: WhatsappTemplate[];
  loading: boolean;
  error: string | null;

  fetchTemplates: () => Promise<void>;
  fetchApprovedTemplates: () => Promise<void>;

  createTemplate: (payload: Partial<WhatsappTemplate>) => Promise<string | null>;
  updateTemplate: (id: string, payload: Partial<WhatsappTemplate>) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;

  reset: () => void;
};

export const useWhatsappTemplateStore = create<TemplateState>((set, get) => ({
  templates: [],
  loading: false,
  error: null,

  reset: () => set({ templates: [], loading: false, error: null }),

  /* --------------------------------------------------
     FETCH ALL TEMPLATES (ORG ONLY)
  -------------------------------------------------- */
  fetchTemplates: async () => {
    const { activeOrganization } = useOrganizationStore.getState();

    if (!activeOrganization?.id) {
      set({ templates: [], error: null });
      return;
    }

    set({ loading: true, error: null });

    const { data, error } = await supabase
      .from("whatsapp_templates")
      .select("*")
      .eq("organization_id", activeOrganization.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[useWhatsappTemplateStore] fetchTemplates error", error);
      set({ loading: false, error: error.message });
      return;
    }

    set({
      templates: (data ?? []) as WhatsappTemplate[],
      loading: false,
    });
  },

  /* --------------------------------------------------
     FETCH APPROVED TEMPLATES (ORG ONLY)
  -------------------------------------------------- */
  fetchApprovedTemplates: async () => {
    const { activeOrganization } = useOrganizationStore.getState();

    if (!activeOrganization?.id) {
      set({ templates: [], error: null });
      return;
    }

    set({ loading: true, error: null });

    const { data, error } = await supabase
      .from("whatsapp_templates")
      .select("*")
      .eq("organization_id", activeOrganization.id)
      .eq("status", "approved")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(
        "[useWhatsappTemplateStore] fetchApprovedTemplates error",
        error
      );
      set({ loading: false, error: error.message });
      return;
    }

    set({
      templates: (data ?? []) as WhatsappTemplate[],
      loading: false,
    });
  },

  /* --------------------------------------------------
     CREATE TEMPLATE
  -------------------------------------------------- */
  createTemplate: async (payload) => {
    const { activeOrganization } = useOrganizationStore.getState();

    if (!activeOrganization?.id) {
      set({ error: "Select an organization first." });
      return null;
    }

    const { data, error } = await supabase
      .from("whatsapp_templates")
      .insert({
        ...payload,
        organization_id: activeOrganization.id,
      
        // ✅ VARIABLE TEMPLATE HARDENING DEFAULTS
        header_variable_count: payload.header_variable_count ?? 0,
        header_variable_indices: payload.header_variable_indices ?? null,
      
        body_variable_count: payload.body_variable_count ?? 0,
        body_variable_indices: payload.body_variable_indices ?? null,
      })
      
      .select("id")
      .single();

    if (error) {
      console.error("[useWhatsappTemplateStore] createTemplate error", error);
      set({ error: error.message });
      return null;
    }

    return data?.id ?? null;
  },

  /* --------------------------------------------------
     UPDATE TEMPLATE
  -------------------------------------------------- */
  updateTemplate: async (id, payload) => {
    const { error } = await supabase
      .from("whatsapp_templates")
      .update({
        ...payload,
      
        // ✅ Preserve variable schema unless explicitly changed
        header_variable_count:
          payload.header_variable_count ?? undefined,
        header_variable_indices:
          payload.header_variable_indices ?? undefined,
      
        body_variable_count:
          payload.body_variable_count ?? undefined,
        body_variable_indices:
          payload.body_variable_indices ?? undefined,
      
        updated_at: new Date().toISOString(),
      })
      
      .eq("id", id);

    if (error) {
      console.error("[useWhatsappTemplateStore] updateTemplate error", error);
      set({ error: error.message });
      throw error;
    }
  },

  /* --------------------------------------------------
     DELETE TEMPLATE
  -------------------------------------------------- */
  deleteTemplate: async (id) => {
    const { error } = await supabase
      .from("whatsapp_templates")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("[useWhatsappTemplateStore] deleteTemplate error", error);
      set({ error: error.message });
      throw error;
    }

    set({
      templates: get().templates.filter((t) => t.id !== id),
    });
  },
}));