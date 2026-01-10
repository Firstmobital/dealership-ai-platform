import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";

import type { Campaign, CampaignMessage } from "../types/database";
import {
  validateTemplateVariables,
} from "../lib/templateVariables";


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
    name: string;
    description?: string;
    whatsapp_template_id: string;
    reply_sheet_tab: string; // ✅ NEW
    scheduledAt: string | null;
    rows: CsvRow[];
  }) => Promise<string>;

  launchCampaign: (
    campaignId: string,
    scheduledAt?: string | null
  ) => Promise<void>;

  retryFailedMessages: (campaignId: string) => Promise<void>;
};

/* =========================================================
   HELPERS
========================================================= */
function safeTemplateBody(body: unknown): string {
  const s = String(body ?? "").trim();
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
     FETCH CAMPAIGNS (ORG ONLY)
  ------------------------------------------------------ */
  fetchCampaigns: async (organizationId) => {
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
      console.error(
        "[useCampaignStore] fetchCampaignMessages error",
        error
      );
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
    name,
    description,
    whatsapp_template_id,
    reply_sheet_tab, // ✅ NEW
    scheduledAt,
    rows,
  }) => {
    const status: Campaign["status"] = scheduledAt
      ? "scheduled"
      : "draft";

    // Sanitize phones early
    const cleanedRows = rows
      .map((r) => ({
        ...r,
        phone: String(r.phone ?? "").trim(),
      }))
      .filter((r) => r.phone.length >= 8);

    if (!cleanedRows.length) {
      throw new Error("CSV has no valid phone rows.");
    }


    /* 1️⃣ Fetch template snapshot */
    const { data: template, error: tplError } = await supabase
      .from("whatsapp_templates")
      .select(`
        id,
        name,
        body,
        language,
        status,
        header_variable_count,
        header_variable_indices,
        body_variable_count,
        body_variable_indices
      `)
      
      .eq("id", whatsapp_template_id)
      .single();

    if (tplError || !template) {
      console.error("[useCampaignStore] template fetch error", tplError);
      throw tplError ?? new Error("Template not found");
    }

    if (template.status !== "approved") {
      throw new Error("Template is not approved yet");
    }
    /* --------------------------------------------------
   VARIABLE SCHEMA VALIDATION (DEFENSIVE)
-------------------------------------------------- */
const schema = {
  header_variable_count: template.header_variable_count,
  header_variable_indices: template.header_variable_indices,
  body_variable_count: template.body_variable_count,
  body_variable_indices: template.body_variable_indices,
};

for (const row of cleanedRows) {
  const result = validateTemplateVariables(
    row.variables as any,
    schema
  );

  if (!result.ok) {
    throw new Error(
      `Variable mismatch for phone ${row.phone}: ${result.error}`
    );
  }
}


    const bodySnapshot = safeTemplateBody(template.body);

    /* 2️⃣ Create campaign row */
    const { data: campaignData, error: campaignError } =
      await supabase
        .from("campaigns")
        .insert({
          organization_id: organizationId,
          name,
          description: description ?? null,
          channel: "whatsapp",

          whatsapp_template_id: template.id,
          template_name: template.name ?? null,
          template_body: bodySnapshot,

          template_variables: null,
          status,
          scheduled_at: scheduledAt,

          reply_sheet_tab: reply_sheet_tab || null, // ✅ STORED HERE

          total_recipients: cleanedRows.length,
          sent_count: 0,
          failed_count: 0,
        })
        .select("id")
        .single();

    if (campaignError || !campaignData) {
      console.error(
        "[useCampaignStore] createCampaign error",
        campaignError
      );
      throw campaignError ?? new Error("Failed to create campaign");
    }

    const campaignId = campaignData.id as string;

    /* 3️⃣ Insert campaign messages */
    const messagesPayload = cleanedRows.map((row) => ({
      organization_id: organizationId,
      campaign_id: campaignId,
      phone: row.phone,
      variables: row.variables ?? {},
      status: "pending",
    }));

    const { error: msgErr } = await supabase
      .from("campaign_messages")
      .insert(messagesPayload);

    if (msgErr) {
      console.error(
        "[useCampaignStore] insert messages error",
        msgErr
      );
      throw msgErr;
    }

    /* 4️⃣ Refresh store */
    await get().fetchCampaigns(organizationId);
    await get().fetchCampaignMessages(campaignId);

    return campaignId;
  },

  /* ------------------------------------------------------
     LAUNCH CAMPAIGN (SEND NOW OR SCHEDULE)
  ------------------------------------------------------ */
  launchCampaign: async (campaignId, scheduledAt) => {
    const effectiveTime =
      scheduledAt ?? new Date().toISOString();

    const { error } = await supabase
      .from("campaigns")
      .update({
        status: "scheduled",
        scheduled_at: effectiveTime,
      })
      .eq("id", campaignId);

    if (error) {
      console.error(
        "[useCampaignStore] launchCampaign error",
        error
      );
      throw error;
    }

    set((state) => ({
      campaigns: state.campaigns.map((c) =>
        c.id === campaignId
          ? {
              ...c,
              status: "scheduled",
              scheduled_at: effectiveTime,
            }
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
      console.error(
        "[useCampaignStore] retryFailedMessages error",
        error
      );
      throw error;
    }

    const orgId =
      get().campaigns.find((c) => c.id === campaignId)
        ?.organization_id;

    if (orgId) {
      await get().fetchCampaigns(orgId);
      await get().fetchCampaignMessages(campaignId);
    }
  },
}));