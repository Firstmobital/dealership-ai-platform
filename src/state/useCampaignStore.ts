import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";
import type { Campaign, CampaignMessage } from "../types/database";

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
};

export const useCampaignStore = create<CampaignState>((set, get) => ({
  campaigns: [],
  messages: {},
  loading: false,

  // -------------------------------------------------------------
  // FETCH CAMPAIGNS
  // -------------------------------------------------------------
  fetchCampaigns: async (organizationId: string) => {
    set({ loading: true });

    const { data, error } = await supabase
      .from("campaigns")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[useCampaignStore] fetchCampaigns error", error);
      set({ loading: false });
      throw error;
    }

    set({ campaigns: (data ?? []) as Campaign[], loading: false });
  },

  // -------------------------------------------------------------
  // FETCH CAMPAIGN MESSAGES
  // -------------------------------------------------------------
  fetchCampaignMessages: async (campaignId: string) => {
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

  // -------------------------------------------------------------
  // CREATE CAMPAIGN + INSERT RECIPIENTS
  // -------------------------------------------------------------
  createCampaignWithMessages: async ({
    organizationId,
    name,
    description,
    templateBody,
    templateVariables,
    scheduledAt,
    rows,
  }) => {
    const status = scheduledAt ? "scheduled" : "draft";
    const totalRecipients = rows.length;

    // 1️⃣ Create campaign row
    const { data: campaignData, error: campaignError } = await supabase
      .from("campaigns")
      .insert({
        organization_id: organizationId,
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

    // 2️⃣ Insert campaign_messages
    if (rows.length > 0) {
      const messagesPayload = rows.map((row) => ({
        organization_id: organizationId,
        campaign_id: campaignId,
        phone: row.phone,
        variables: row.variables,
        status: "pending",
      }));

      const { error: messagesError } = await supabase
        .from("campaign_messages")
        .insert(messagesPayload);

      if (messagesError) {
        console.error(
          "[useCampaignStore] insert campaign_messages error",
          messagesError
        );
        throw messagesError;
      }
    }

    // 3️⃣ Refresh store
    await get().fetchCampaigns(organizationId);
    await get().fetchCampaignMessages(campaignId);

    return campaignId;
  },

  // -------------------------------------------------------------
  // LAUNCH CAMPAIGN (SET STATUS = scheduled)
  // -------------------------------------------------------------
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

    // Optimistic update
    set((state) => ({
      campaigns: state.campaigns.map((c) =>
        c.id === campaignId
          ? { ...c, status: "scheduled", scheduled_at: effectiveTime }
          : c
      ),
    }));
  },
}));
