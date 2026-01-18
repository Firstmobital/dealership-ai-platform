import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";
import toast from "react-hot-toast";

import type { Campaign, CampaignMessage } from "../types/database";
import {
  parseCsvVariables,
  validateTemplateVariables,
} from "../lib/templateVariables";

/* =========================================================
   TYPES
========================================================= */
type CsvRow = {
  phone: string;
  row: Record<string, string>; // normalized headers
};

type CampaignState = {
  campaigns: Campaign[];
  messages: Record<string, CampaignMessage[]>;
  loading: boolean;

  reset: () => void;

  fetchCampaigns: (organizationId: string) => Promise<void>;
  fetchCampaignMessages: (campaignId: string) => Promise<void>;

  createCampaignWithMessages: (args: {
    organizationId: string;
    name: string;
    description?: string;
    whatsapp_template_id: string;
    reply_sheet_tab: string;
    scheduledAt: string | null;
    rows: CsvRow[];
    variable_map: Record<string, string>; // "1" -> columnName
    campaign_type: "marketing" | "utility" | "psf";
  }) => Promise<string>;

  launchCampaign: (
    campaignId: string,
    scheduledAt?: string | null,
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

  reset: () => set({ campaigns: [], messages: {}, loading: false }),

  /* ------------------------------------------------------
     FETCH CAMPAIGNS
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

    set({ campaigns: (data ?? []) as Campaign[], loading: false });
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
    name,
    description,
    whatsapp_template_id,
    reply_sheet_tab,
    scheduledAt,
    rows,
    variable_map,
    campaign_type,
  }) => {
    const status: Campaign["status"] = scheduledAt ? "scheduled" : "draft";

    /* 0️⃣ Sanitize phones */
    const cleanedRows = rows
      .map((r) => ({
        ...r,
        phone: String(r.phone ?? "").trim(),
      }))
      .filter((r) => r.phone.length >= 8);

    if (!cleanedRows.length) {
      throw new Error("Upload has no valid phone rows.");
    }

    /* 1️⃣ Fetch template snapshot */
    const { data: template, error: tplError } = await supabase
      .from("whatsapp_templates")
      .select(
        `
        id,
        name,
        body,
        status,
        header_variable_count,
        header_variable_indices,
        body_variable_count,
        body_variable_indices
      `,
      )
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

    /* 2️⃣ Build per-row variables (EXPLICIT body vars) */
    const mappedRows = cleanedRows.map((r) => {
      const variables: Record<string, string> = {};

      Object.keys(variable_map ?? {}).forEach((idx) => {
        const columnName = variable_map[idx];
        const safeIdx = String(idx).trim();

        variables[`body_${safeIdx}`] =
          columnName && r.row?.[columnName] !== undefined
            ? String(r.row[columnName])
            : "";
      });

      return {
        phone: r.phone,
        raw_row: r.row,
        variables,
      };
    });

    /* 3️⃣ Variable schema validation (CORRECT SHAPE) */
    const schema = {
      header_variable_count: template.header_variable_count,
      header_variable_indices: template.header_variable_indices,
      body_variable_count: template.body_variable_count,
      body_variable_indices: template.body_variable_indices,
    };

    for (const row of mappedRows) {
      let parsed;
      let result;

      try {
        parsed = parseCsvVariables(row.variables);
        result = validateTemplateVariables(parsed, schema);
      } catch {
        throw new Error(
          `Template variable validation crashed for phone ${row.phone}. ` +
            `This indicates a variable index/schema mismatch.`,
        );
      }

      if (!result.ok) {
        throw new Error(
          `Variable mismatch for phone ${row.phone}: ${result.error}`,
        );
      }
    }

    /* 4️⃣ Create campaign row */
    const { data: campaignData, error: campaignError } = await supabase
      .from("campaigns")
      .insert({
        organization_id: organizationId,
        name,
        description: description ?? null,
        channel: "whatsapp",

        whatsapp_template_id: template.id,
        template_name: template.name ?? null,
        template_body: bodySnapshot,

        status,
        scheduled_at: scheduledAt,

        reply_sheet_tab: reply_sheet_tab || null,

        meta: {
          variable_map,
          is_psf: campaign_type === "psf",
        },

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

    /* 5️⃣ Insert campaign messages */
    const messagesPayload = mappedRows.map((row) => ({
      organization_id: organizationId,
      campaign_id: campaignId,
      phone: row.phone,
      variables: row.variables,
      raw_row: row.raw_row,
      status: "pending",
    }));

    const { error: msgErr } = await supabase
      .from("campaign_messages")
      .insert(messagesPayload);

    if (msgErr) {
      console.error("[useCampaignStore] insert messages error", msgErr);
      throw msgErr;
    }

    /* 6️⃣ Refresh store */
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
      toast.error("Failed to schedule campaign");
      throw error;
    }

    set((state) => ({
      campaigns: state.campaigns.map((c) =>
        c.id === campaignId
          ? { ...c, status: "scheduled", scheduled_at: effectiveTime }
          : c,
      ),
    }));

    // Phase 6: reconciliation read to ensure UI matches authoritative DB state.
    const orgId = get().campaigns.find((c) => c.id === campaignId)?.organization_id;
    if (orgId) {
      try {
        await get().fetchCampaigns(orgId);
        await get().fetchCampaignMessages(campaignId);
      } catch {
        // ignore; optimistic state already applied
      }
    }

    toast.success("Campaign scheduled");
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
        read_at: null,
        error: null,
        whatsapp_message_id: null,
      })
      .eq("campaign_id", campaignId)
      .eq("status", "failed");  

    if (error) {
      console.error("[useCampaignStore] retryFailedMessages error", error);
      toast.error("Failed to retry failed messages");
      throw error;
    }

    const orgId = get().campaigns.find(
      (c) => c.id === campaignId,
    )?.organization_id;

    if (orgId) {
      await get().fetchCampaigns(orgId);
      await get().fetchCampaignMessages(campaignId);
    }

    toast.success("Retry queued");
  },
}));