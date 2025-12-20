import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";
import type { WhatsappTemplate } from "../types/database";
import { useSubOrganizationStore } from "./useSubOrganizationStore";

type TemplateState = {
  templates: WhatsappTemplate[];
  loading: boolean;
  error: string | null;

  fetchTemplates: (organizationId: string) => Promise<void>;
  createTemplate: (payload: Partial<WhatsappTemplate>) => Promise<string | null>;
  updateTemplate: (id: string, payload: Partial<WhatsappTemplate>) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
};

export const useWhatsappTemplateStore = create<TemplateState>((set, get) => ({
  templates: [],
  loading: false,
  error: null,

  fetchTemplates: async (organizationId) => {
    const { activeSubOrg } = useSubOrganizationStore.getState();
    set({ loading: true, error: null });

    let q = supabase
      .from("whatsapp_templates")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    // division fallback: show suborg + org templates
    if (activeSubOrg) {
      q = q.or(
        `sub_organization_id.eq.${activeSubOrg.id},sub_organization_id.is.null`
      );
    }

    const { data, error } = await q;

    if (error) {
      console.error("[useWhatsappTemplateStore] fetchTemplates error", error);
      set({ loading: false, error: error.message });
      return;
    }

    set({ templates: (data ?? []) as WhatsappTemplate[], loading: false });
  },

  createTemplate: async (payload) => {
    const { data, error } = await supabase
      .from("whatsapp_templates")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      console.error("[useWhatsappTemplateStore] createTemplate error", error);
      set({ error: error.message });
      return null;
    }

    return data?.id ?? null;
  },

  updateTemplate: async (id, payload) => {
    const { error } = await supabase
      .from("whatsapp_templates")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      console.error("[useWhatsappTemplateStore] updateTemplate error", error);
      set({ error: error.message });
      throw error;
    }
  },

  deleteTemplate: async (id) => {
    const { error } = await supabase.from("whatsapp_templates").delete().eq("id", id);
    if (error) {
      console.error("[useWhatsappTemplateStore] deleteTemplate error", error);
      set({ error: error.message });
      throw error;
    }
    set({ templates: get().templates.filter((t) => t.id !== id) });
  },
}));
