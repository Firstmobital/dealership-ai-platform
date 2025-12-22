///Users/air/dealership-ai-platform/src/state/useCampaignStore.ts

import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";

import type { Campaign, CampaignMessage } from "../types/database";
import { useSubOrganizationStore } from "./useSubOrganizationStore";

/* =========================================================
   TYPES
========================================================= */
type CsvRow = {
  phone: string;
  variables: Record<string, unknown>;
};

type CampaignState = {
  campaigns: Campaign[];
  messages: Record<string, CampaignMessage[]>;
  loading: boolean;

  fetchCampaigns: (organizationId: string) => Promise<void>;
  fetchCampaignMessages: (campaignId: string) => Promise<void>;

  createCampaignWithMessages: (args: {
    organizationId: string;
    sub_organization_id?: string | null;
    name: string;
    description?: string;

    whatsapp_template_id: string;
    scheduledAt: string | null;
    rows: CsvRow[];
  }) => Promise<string>;

  launchCampaign: (
    campaignId: string,
    scheduledAt?: string | null
  ) => Promise<void>;

  retryFailedMessages: (campaignId: string) => Promise<void>;
};

function safeTemplateBody(body: unknown): string {
  const s = String(body ?? "").trim();
  // campaigns.template_body is NOT NULL -> must always be non-empty
  return s.length ? s : "(no body)";
}

/* =========================================================
   STORE
========================================================= */
export const useCampaignStore = create<CampaignState>((set, get) => ({
  campaigns: [],
  messages: {},
  loading: false,

  /* ------------------------------------------------------
     FETCH CAMPAIGNS (ORG + SUB-ORG FALLBACK)
  ------------------------------------------------------ */
  fetchCampaigns: async (organizationId) => {
    const { activeSubOrg } = useSubOrganizationStore.getState();
    set({ loading: true });

    let query = supabase
      .from("campaigns")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (activeSubOrg) {
      query = query.or(
        `sub_organization_id.eq.${activeSubOrg.id},sub_organization_id.is.null`
      );
    }

    const { data, error } = await query;

    if (error) {
      console.error("[useCampaignStore] fetchCampaigns error", error);
      set({ loading: false });
      throw error;
    }

    set({
      campaigns: (data ?? []) as Campaign[],
      loading: false,
    });
  },

  /* ------------------------------------------------------
     FETCH CAMPAIGN MESSAGES
  ------------------------------------------------------ */
  fetchCampaignMessages: async (campaignId) => {
    const { data, error } = await supabase
      .from("campaign_messages")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[useCampaignStore] fetchCampaignMessages error", error);
      throw error;
    }

    set((state) => ({
      messages: {
        ...state.messages,
        [campaignId]: (data ?? []) as CampaignMessage[],
      },
    }));
  },

  /* ------------------------------------------------------
     CREATE CAMPAIGN (DRAFT / SCHEDULED)
  ------------------------------------------------------ */
  createCampaignWithMessages: async ({
    organizationId,
    sub_organization_id,
    name,
    description,
    whatsapp_template_id,
    scheduledAt,
    rows,
  }) => {
    const { activeSubOrg } = useSubOrganizationStore.getState();
    const finalSubOrg = sub_organization_id ?? activeSubOrg?.id ?? null;
    const status = scheduledAt ? "scheduled" : "draft";

    // Basic phone sanity to avoid bad rows causing hidden failures later
    const cleanedRows = rows
      .map((r) => ({
        ...r,
        phone: String(r.phone ?? "").trim(),
      }))
      .filter((r) => r.phone.length >= 8);

    if (cleanedRows.length === 0) {
      throw new Error("CSV has no valid phone rows.");
    }

    /* 1) Fetch template (must be approved) */
    const { data: template, error: tplError } = await supabase
      .from("whatsapp_templates")
      .select("id, name, body, language, status")
      .eq("id", whatsapp_template_id)
      .single();

    if (tplError || !template) {
      console.error("[useCampaignStore] template fetch error", tplError);
      throw tplError ?? new Error("Template not found");
    }

    if (template.status !== "approved") {
      throw new Error("Template is not approved yet");
    }

    const bodySnapshot = safeTemplateBody(template.body);

    /* 2) Create campaign */
    const { data: campaignData, error: campaignError } = await supabase
      .from("campaigns")
      .insert({
        organization_id: organizationId,
        sub_organization_id: finalSubOrg,
        name,
        description: description ?? null,
        channel: "whatsapp",

        whatsapp_template_id: template.id,
        template_name: template.name ?? null,

        // IMPORTANT: NOT NULL in DB
        template_body: bodySnapshot,

        // optional in DB; keep null for now (later we can compute)
        template_variables: null,

        status,
        scheduled_at: scheduledAt,

        total_recipients: cleanedRows.length,
        sent_count: 0,
        failed_count: 0,
      })
      .select("id")
      .single();

    if (campaignError || !campaignData) {
      console.error("[useCampaignStore] createCampaign error", campaignError);
      throw campaignError ?? new Error("Failed to create campaign");
    }

    const campaignId = campaignData.id as string;

    /* 3) Insert campaign messages */
    const payload = cleanedRows.map((row) => ({
      organization_id: organizationId,
      campaign_id: campaignId,
      sub_organization_id: finalSubOrg,
      phone: row.phone,
      variables: row.variables ?? {},
      status: "pending",
    }));

    const { error: msgErr } = await supabase
      .from("campaign_messages")
      .insert(payload);

    if (msgErr) {
      console.error("[useCampaignStore] insert messages error", msgErr);
      throw msgErr;
    }

    /* 4) Refresh state */
    await get().fetchCampaigns(organizationId);
    await get().fetchCampaignMessages(campaignId);

    return campaignId;
  },

  /* ------------------------------------------------------
     LAUNCH CAMPAIGN
  ------------------------------------------------------ */
  launchCampaign: async (campaignId, scheduledAt) => {
    const effectiveTime = scheduledAt ?? new Date().toISOString();

    const { error } = await supabase
      .from("campaigns")
      .update({
        status: "scheduled",
        scheduled_at: effectiveTime,
      })
      .eq("id", campaignId);

    if (error) {
      console.error("[useCampaignStore] launchCampaign error", error);
      throw error;
    }

    set((state) => ({
      campaigns: state.campaigns.map((c) =>
        c.id === campaignId
          ? { ...c, status: "scheduled", scheduled_at: effectiveTime }
          : c
      ),
    }));
  },

  /* ------------------------------------------------------
     RETRY FAILED MESSAGES
  ------------------------------------------------------ */
  retryFailedMessages: async (campaignId) => {
    const { error } = await supabase
      .from("campaign_messages")
      .update({
        status: "pending",
        dispatched_at: null,
        delivered_at: null,
        error: null,
        whatsapp_message_id: null,
      })
      .eq("campaign_id", campaignId)
      .eq("status", "failed");

    if (error) {
      console.error("[useCampaignStore] retryFailedMessages error", error);
      throw error;
    }

    await get().fetchCampaigns(
      get().campaigns.find(c => c.id === campaignId)?.organization_id!
    );    
  },
}));
