import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";

import type { Campaign, CampaignMessage } from "../types/database";
import { useSubOrganizationStore } from "./useSubOrganizationStore";

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
    templateBody: string;
    templateVariables: string[];
    scheduledAt: string | null;
    rows: CsvRow[];
  }) => Promise<string>;

  launchCampaign: (
    campaignId: string,
    scheduledAt?: string | null
  ) => Promise<void>;

  retryFailedMessages: (campaignId: string) => Promise<void>;
};

export const useCampaignStore = create<CampaignState>((set, get) => ({
  campaigns: [],
  messages: {},
  loading: false,

  /* -------------------------------------------------------------- */
  /* FETCH CAMPAIGNS (ORG + SUB-ORG AWARE)                          */
  /* -------------------------------------------------------------- */
  fetchCampaigns: async (organizationId) => {
    const { activeSubOrg } = useSubOrganizationStore.getState();
    set({ loading: true });

    let query = supabase
      .from("campaigns")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (activeSubOrg) {
      query = query.eq("sub_organization_id", activeSubOrg.id);
    } else {
      query = query.is("sub_organization_id", null);
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

  /* -------------------------------------------------------------- */
  /* FETCH CAMPAIGN MESSAGES (SUB-ORG AWARE)                        */
  /* -------------------------------------------------------------- */
  fetchCampaignMessages: async (campaignId) => {
    const { activeSubOrg } = useSubOrganizationStore.getState();

    let query = supabase
      .from("campaign_messages")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true });

    if (activeSubOrg) {
      query = query.eq("sub_organization_id", activeSubOrg.id);
    } else {
      query = query.is("sub_organization_id", null);
    }

    const { data, error } = await query;

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

  /* -------------------------------------------------------------- */
  /* CREATE CAMPAIGN + INSERT MESSAGES (SUB-ORG INCLUDED)           */
  /* -------------------------------------------------------------- */
  createCampaignWithMessages: async ({
    organizationId,
    sub_organization_id,
    name,
    description,
    templateBody,
    templateVariables,
    scheduledAt,
    rows,
  }) => {
    const { activeSubOrg } = useSubOrganizationStore.getState();
    const finalSubOrg = sub_organization_id ?? activeSubOrg?.id ?? null;

    const status = scheduledAt ? "scheduled" : "draft";
    const totalRecipients = rows.length;

    /* 1️⃣ Create Campaign */
    const { data: campaignData, error: campaignError } = await supabase
      .from("campaigns")
      .insert({
        organization_id: organizationId,
        sub_organization_id: finalSubOrg, // ← REQUIRED
        name,
        description: description ?? null,
        channel: "whatsapp",
        status,
        scheduled_at: scheduledAt,
        template_body: templateBody,
        template_variables: templateVariables,
        total_recipients: totalRecipients,
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

    /* 2️⃣ Insert Campaign Messages */
    if (rows.length > 0) {
      const messagesPayload = rows.map((row) => ({
        organization_id: organizationId,
        campaign_id: campaignId,
        sub_organization_id: finalSubOrg, // ← REQUIRED
        phone: row.phone,
        variables: row.variables,
        status: "pending",
      }));

      const { error: messagesError } = await supabase
        .from("campaign_messages")
        .insert(messagesPayload);

      if (messagesError) {
        console.error("[useCampaignStore] insert messages error", messagesError);
        throw messagesError;
      }
    }

    /* 3️⃣ Refresh stores */
    await get().fetchCampaigns(organizationId);
    await get().fetchCampaignMessages(campaignId);

    return campaignId;
  },

  /* -------------------------------------------------------------- */
  /* LAUNCH CAMPAIGN                                                */
  /* -------------------------------------------------------------- */
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

  /* -------------------------------------------------------------- */
  /* RETRY FAILED (SUB-ORG AWARE)                                   */
  /* -------------------------------------------------------------- */
  retryFailedMessages: async (campaignId) => {
    const { campaigns } = get();
    const campaign = campaigns.find((c) => c.id === campaignId);
    const organizationId = campaign?.organization_id;

    const { activeSubOrg } = useSubOrganizationStore.getState();

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
      .eq("sub_organization_id", activeSubOrg?.id ?? null); // ← REQUIRED

    if (error) {
      console.error("[useCampaignStore] retryFailedMessages error", error);
      throw error;
    }

    if (organizationId) await get().fetchCampaigns(organizationId);
    await get().fetchCampaignMessages(campaignId);
  },
}));
