import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";
import { useOrganizationStore } from "./useOrganizationStore";

type AnalyticsState = {
  loading: boolean;

  overview: any[];
  campaigns: any[];
  templates: any[];

  fetchOverview: (from: string, to: string) => Promise<void>;
  fetchCampaigns: () => Promise<void>;
  fetchTemplates: () => Promise<void>;
};

export const useAnalyticsStore = create<AnalyticsState>((set) => ({
  loading: false,

  overview: [],
  campaigns: [],
  templates: [],

  /* ======================================================
     OVERVIEW (Daily WhatsApp Stats — ORG ONLY)
  ====================================================== */
  fetchOverview: async (from, to) => {
    const { currentOrganization } = useOrganizationStore.getState();

    if (!currentOrganization?.id) return;

    set({ loading: true });

    const { data, error } = await supabase
      .from("whatsapp_overview_daily_v1")
      .select("*")
      .eq("organization_id", currentOrganization.id)
      .gte("day", from)
      .lte("day", to)
      .order("day", { ascending: true });

    if (error) {
      console.error("[Analytics] fetchOverview error", error);
    } else {
      set({ overview: data ?? [] });
    }

    set({ loading: false });
  },

  /* ======================================================
     CAMPAIGN ANALYTICS (ORG ONLY)
  ====================================================== */
  fetchCampaigns: async () => {
    const { currentOrganization } = useOrganizationStore.getState();

    if (!currentOrganization?.id) return;

    set({ loading: true });

    const { data, error } = await supabase
      .from("campaign_analytics_summary_v2")
      .select("*")
      .eq("organization_id", currentOrganization.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Analytics] fetchCampaigns error", error);
    } else {
      set({ campaigns: data ?? [] });
    }

    set({ loading: false });
  },

  /* ======================================================
     TEMPLATE ANALYTICS (ORG ONLY)
  ====================================================== */
  fetchTemplates: async () => {
    const { currentOrganization } = useOrganizationStore.getState();

    if (!currentOrganization?.id) return;

    set({ loading: true });

    const { data, error } = await supabase
      .from("template_analytics_summary_v2")
      .select("*")
      .eq("organization_id", currentOrganization.id)
      .order("total_messages", { ascending: false });

    if (error) {
      console.error("[Analytics] fetchTemplates error", error);
    } else {
      set({ templates: data ?? [] });
    }

    set({ loading: false });
  },
}));