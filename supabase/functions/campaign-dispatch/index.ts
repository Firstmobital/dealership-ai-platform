// supabase/functions/campaign-dispatch/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { logAuditEvent } from "../_shared/audit.ts";
import { isInternalRequest, getRequestId } from "../_shared/auth.ts";
/* ============================================================
   ENV
============================================================ */
const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;
const INTERNAL_API_KEY = Deno.env.get("INTERNAL_API_KEY") || "";

if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing PROJECT_URL or SERVICE_ROLE_KEY");
}

const supabaseAdmin = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* ============================================================
   DISPATCH LIMITS
============================================================ */
const GLOBAL_MAX_MESSAGES_PER_RUN = 100;
const MAX_MESSAGES_PER_CAMPAIGN_PER_RUN = 50;
const ORG_RATE_LIMIT_PER_RUN = 30;
const MAX_CAMPAIGNS_PER_RUN = 20;

/* ============================================================
   TYPES
============================================================ */
type CampaignStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "completed"
  | "cancelled"
  | "failed";

type Campaign = {
  id: string;
  organization_id: string;
  whatsapp_template_id: string | null;
  status: CampaignStatus;
  scheduled_at: string | null;
  started_at: string | null;
  launched_at: string | null;
  meta: {
    variable_map?: Record<string, string>;
    is_psf?: boolean;
  } | null;
  reply_sheet_tab: string | null;
  campaign_id: string;
  campaign_message_id: string;
};

type CampaignMessageStatus =
  | "pending"
  | "queued"
  | "sent"
  | "delivered"
  | "failed"
  | "cancelled";

type CampaignMessage = {
  id: string;
  organization_id: string;
  campaign_id: string;
  contact_id: string | null;
  phone: string;
  raw_row: Record<string, any> | null;
  variables: Record<string, unknown> | null; // legacy
  status: CampaignMessageStatus;
};

type WhatsappTemplate = {
  name: string;
  language: string;
  status: "approved" | "pending" | "rejected";
  body: string | null;

  header_type: "NONE" | "TEXT" | "IMAGE" | "DOCUMENT" | string;
  header_media_url: string | null;
  header_media_mime: string | null;

  header_variable_count: number;
  header_variable_indices: number[] | null;
  body_variable_count: number;
  body_variable_indices: number[] | null;
};

type DispatchMode = "scheduled" | "immediate";

/* ============================================================
   PHONE HELPERS
   - Contacts + conversations use digits-only "91XXXXXXXXXX"
   - WhatsApp send uses "91XXXXXXXXXX" (no plus) in Cloud API
============================================================ */
function normalizeToIndiaDigits(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = String(raw).replace(/\D/g, "");
  if (!d) return null;

  // If already 91 + 10 digits
  if (d.startsWith("91") && d.length >= 12) return d.slice(0, 12);

  // If 10 digits, prefix 91
  if (d.length === 10) return `91${d}`;

  // Fallback: keep digits (but cap to avoid junk)
  if (d.length > 15) return d.slice(0, 15);
  return d;
}

function toE164Plus(digits: string): string | null {
  if (!digits) return null;
  const d = digits.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("91") && d.length === 12) return `+${d}`;
  if (d.length === 10) return `+91${d}`;
  if (d.startsWith("+91") && /^\+91\d{10}$/.test(digits)) return digits;
  return null;
}

function waToFromE164(phonePlus: string) {
  // "+91XXXXXXXXXX" -> "91XXXXXXXXXX"
  return phonePlus.replace(/^\+/, "");
}
function buildWhatsappParamsFromRow(params: {
  template: WhatsappTemplate;
  rawRow: Record<string, any> | null;
  variableMap: Record<string, string> | undefined;
}) {
  if (!params.variableMap || !params.rawRow) return [];

  const out: any[] = [];

  const headerVars = params.template.header_variable_indices ?? [];
  const bodyVars = params.template.body_variable_indices ?? [];

  for (const idx of [...headerVars, ...bodyVars]) {
    const column = params.variableMap[String(idx)];
    let rawValue = column ? params.rawRow[column] : "";

    let value = "";

    if (rawValue === null || rawValue === undefined) {
      value = "";
    } else if (typeof rawValue === "string" || typeof rawValue === "number") {
      value = String(rawValue);
    } else if (typeof rawValue === "object") {
      // try common patterns first
      value =
        rawValue.name ??
        rawValue.label ??
        rawValue.value ??
        rawValue.text ??
        JSON.stringify(rawValue);
    } else {
      value = String(rawValue);
    }
    out.push({ type: "text", text: value });
  }

  return out;
}

/* ============================================================
   PHASE 2.4 — TEMPLATE HEADER COMPONENTS
============================================================ */
function buildTemplateHeaderComponents(template: WhatsappTemplate) {
  const headerType = String(template.header_type ?? "").toUpperCase();

  if (headerType === "IMAGE") {
    return [
      {
        type: "header",
        parameters: [
          {
            type: "image",
            image: { link: template.header_media_url },
          },
        ],
      },
    ];
  }

  if (headerType === "DOCUMENT") {
    return [
      {
        type: "header",
        parameters: [
          {
            type: "document",
            document: {
              link: template.header_media_url,
              filename: "Document",
            },
          },
        ],
      },
    ];
  }

  return [];
}

/* ============================================================
   TEMPLATE TEXT RENDER (best-effort for UI)
============================================================ */

/* ============================================================
   PHASE 2 — CONVERSATION TOPIC / ENTITY SEEDING (CAMPAIGNS)
============================================================ */
function isLikelyOfferOrPricing(text: string): boolean {
  const t = (text || "").toLowerCase();
  return (
    t.includes("discount") ||
    t.includes("offer") ||
    t.includes("on-road") ||
    t.includes("on road") ||
    t.includes("price") ||
    t.includes("emi") ||
    t.includes("exchange") ||
    t.includes("booking")
  );
}

function inferVehicleModelFromRow(raw: Record<string, any> | null): string | null {
  if (!raw) return null;
  const keys = Object.keys(raw);
  // common column names
  const candidates = ["model","vehicle_model","car_model","vehicle","car","variant"];
  for (const c of candidates) {
    const k = keys.find((kk) => kk.toLowerCase() === c);
    if (k) {
      const v = (raw as any)[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  // fuzzy match: any key containing 'model'
  for (const k of keys) {
    if (k.toLowerCase().includes("model")) {
      const v = (raw as any)[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return null;
}

function resolveTemplateText(
  templateBody: string,
  rawRow: Record<string, any> | null,
  mapping: Record<string, string> | null
) {
  let text = templateBody ?? "";

  for (const [idx, column] of Object.entries(mapping ?? {})) {
    const value =
      rawRow && column in rawRow ? String(rawRow[column] ?? "") : "";

    text = text.replaceAll(`{{${idx}}}`, value);
  }

  return text;
}

/* ============================================================
   FETCH TEMPLATE
============================================================ */
async function fetchTemplate(templateId: string): Promise<WhatsappTemplate> {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_templates")
    .select(
      `
      name,
      language,
      status,
      body,
      header_type,
      header_media_url,
      header_media_mime,
      header_variable_count,
      header_variable_indices,
      body_variable_count,
      body_variable_indices
    `
    )
    .eq("id", templateId)
    .single();

  if (error || !data) throw new Error("Template not found");
  if (data.status !== "approved") throw new Error("Template not approved");

  return data as WhatsappTemplate;
}

/* ============================================================
   SAFE CONTACT UPSERT (C1 PATCH)
============================================================ */
async function upsertContactByPhone(params: {
  organizationId: string;
  phoneDigits: string; // "91XXXXXXXXXX"
  name?: string | null;
}) {
  const { data, error } = await supabaseAdmin
    .from("contacts")
    .upsert(
      {
        organization_id: params.organizationId,
        phone: params.phoneDigits,
        name: params.name ?? null,
      },
      { onConflict: "organization_id,phone" }
    )
    .select("id, phone, name, first_name, last_name, model")
    .single();

  if (error || !data) {
    throw new Error(
      `CONTACT_UPSERT_FAILED: ${error?.message ?? "unknown error"}`
    );
  }

  return data as {
    id: string;
    phone: string;
    name: string | null;
    first_name: string | null;
    last_name: string | null;
    model: string | null;
  };
}

/* ============================================================
   ✅ PSF ADDITION — ENSURE CONVERSATION EXISTS
   (Needed so PSF inbox can open chat & ai-handler can detect PSF by conversation)
============================================================ */
async function ensureConversationForContact(params: {
  organizationId: string;
  contactId: string;
  channel: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("conversations")
    .select("id")
    .eq("organization_id", params.organizationId)
    .eq("contact_id", params.contactId)
    .eq("channel", params.channel)
    .maybeSingle();

  if (error) {
    throw new Error(`CONVERSATION_LOOKUP_FAILED: ${error.message}`);
  }

  if (data?.id) return data.id;

  const { data: created, error: insertError } = await supabaseAdmin
    .from("conversations")
    .insert({
      organization_id: params.organizationId,
      contact_id: params.contactId,
      channel: params.channel,
      ai_enabled: true,
    })
    .select("id")
    .single();

  if (insertError || !created) {
    throw new Error(
      `CONVERSATION_CREATE_FAILED: ${insertError?.message ?? "unknown error"}`
    );
  }

  return created.id as string;
}

/* ============================================================
   SEND WHATSAPP TEMPLATE (calls whatsapp-send)
============================================================ */
async function sendWhatsappTemplate(params: {
  organizationId: string;
  contactId: string;
  phonePlusE164: string; // "+91..."
  templateName: string;
  language: string;
  variables: { type: "text"; text: string }[];
  renderedText: string;
  reply_sheet_tab: string | null;
  campaign_id: string;
  campaign_message_id: string;

  // Phase 2.4
  templateComponents?: any[];
  mediaUrl?: string | null;
  mimeType?: string | null;
  messageType?: "template" | "image" | "document";
}) {
  // Phase 5: audit campaign send attempt (non-blocking)
  logAuditEvent(supabaseAdmin, {
    organization_id: params.organizationId,
    action: "campaign_whatsapp_send_attempt",
    entity_type: "campaign_message",
    entity_id: params.campaign_message_id,
    metadata: { campaign_id: params.campaign_id, template: params.templateName }
  });

  const res = await fetch(`${PROJECT_URL}/functions/v1/whatsapp-send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      ...(INTERNAL_API_KEY ? { "x-internal-api-key": INTERNAL_API_KEY } : {}),
    },
    body: JSON.stringify({
      organization_id: params.organizationId,
      contact_id: params.contactId,
      to: waToFromE164(params.phonePlusE164),
      type: "template",
    
      template_name: params.templateName,
      template_language: params.language,
    
      template_components: [
        ...(params.templateComponents ?? []),
        {
          type: "body",
          parameters: params.variables,
        },
      ],
    
      message_type: params.messageType ?? "template",
      media_url: params.mediaUrl ?? null,
      mime_type: params.mimeType ?? null,
    
      rendered_text: params.renderedText,
      campaign_id: params.campaign_id,
      campaign_message_id: params.campaign_message_id,
      metadata: {
        reply_sheet_tab: params.reply_sheet_tab,
      },
    }),    
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    logAuditEvent(supabaseAdmin, {
      organization_id: params.organizationId,
      action: "campaign_whatsapp_send_failed",
      entity_type: "campaign_message",
      entity_id: params.campaign_message_id,
      metadata: { campaign_id: params.campaign_id, template: params.templateName, error: body }
    });
    throw new Error(JSON.stringify(body));
  }

  const waId = (
    body?.meta_response?.messages?.[0]?.id ??
    body?.meta_response?.message_id ??
    body?.messages?.[0]?.id ??
    body?.message_id ??
    null
  );

  logAuditEvent(supabaseAdmin, {
    organization_id: params.organizationId,
    action: "campaign_whatsapp_send_success",
    entity_type: "campaign_message",
    entity_id: params.campaign_message_id,
    metadata: { campaign_id: params.campaign_id, template: params.templateName, whatsapp_message_id: waId }
  });

  return waId;
}

/* ============================================================
   FETCH CAMPAIGN BY ID (immediate mode)
============================================================ */
async function fetchCampaignById(campaignId: string): Promise<Campaign | null> {
  const { data, error } = await supabaseAdmin
    .from("campaigns")
    .select(
      "id, organization_id, whatsapp_template_id, status, scheduled_at, started_at, launched_at, meta, reply_sheet_tab"
    )
    .eq("id", campaignId)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as Campaign | null;
}

/* ============================================================
   FETCH ELIGIBLE CAMPAIGNS (scheduled runner)
============================================================ */
async function fetchEligibleCampaigns(nowIso: string): Promise<Campaign[]> {
  const { data, error } = await supabaseAdmin
    .from("campaigns")
    .select(
      "id, organization_id, whatsapp_template_id, status, scheduled_at, started_at, launched_at, meta, reply_sheet_tab"
    )
    .in("status", ["scheduled", "sending"])
    .lte("scheduled_at", nowIso)
    .limit(MAX_CAMPAIGNS_PER_RUN);

  if (error) throw error;
  return (data ?? []) as Campaign[];
}

/* ============================================================
   FETCH PENDING MESSAGES
============================================================ */
async function fetchMessages(campaignId: string): Promise<CampaignMessage[]> {
  const { data, error } = await supabaseAdmin
    .from("campaign_messages")
    .select(
      "id, organization_id, campaign_id, contact_id, phone, raw_row, variables, status"
    )
    .eq("campaign_id", campaignId)
    .in("status", ["pending", "queued"])
    .limit(MAX_MESSAGES_PER_CAMPAIGN_PER_RUN);

  if (error) throw error;
  return (data ?? []) as CampaignMessage[];
}

/* ============================================================
   ✅ PSF STEP 2 — CREATE PSF CASES FOR CAMPAIGN
============================================================ */
async function createPsfCasesForCampaign(params: {
  campaign: Campaign;
  messages: CampaignMessage[];
}) {
  const { campaign, messages } = params;

  if (!campaign.meta?.is_psf) return;

  const rows = messages.map((m) => {
    const raw = m.raw_row ?? {};

    return {
      organization_id: m.organization_id,
      campaign_id: m.campaign_id,
      phone: normalizeToIndiaDigits(m.phone),

      // ✅ PSF summary fields (for inbox + UX)
      customer_name: raw.name ?? raw.customer_name ?? raw.first_name ?? null,

      model: raw.model ?? raw.vehicle_model ?? null,

      // ✅ full original uploaded row (authoritative)
      uploaded_data: raw,

      initial_sent_at: new Date().toISOString(),
    };
  });

  if (!rows.length) return;

  // Idempotent insert: avoid duplicates
  const { error } = await supabaseAdmin
    .from("psf_cases")
    .insert(rows, { ignoreDuplicates: true });

  if (error) {
    console.error("[PSF] Failed to create PSF cases", error);
    throw error;
  }
}

/* ============================================================
   FETCH CONTACT (for mapping)
============================================================ */
async function fetchContact(contactId: string) {
  const { data, error } = await supabaseAdmin
    .from("contacts")
    .select("*")
    .eq("id", contactId)
    .maybeSingle();
  if (error) return null;
  return data ?? null;
}

/* ============================================================
   STATUS UPDATES
============================================================ */
async function markSent(id: string, waId: string | null) {
  await supabaseAdmin
    .from("campaign_messages")
    .update({
      status: "sent",
      whatsapp_message_id: waId,
      dispatched_at: new Date().toISOString(),
    })
    .eq("id", id);
}

async function markFailed(id: string, err: string) {
  await supabaseAdmin
    .from("campaign_messages")
    .update({
      status: "failed",
      error: err.slice(0, 1000),
      dispatched_at: new Date().toISOString(),
    })
    .eq("id", id);
}

async function setRenderedText(id: string, renderedText: string) {
  await supabaseAdmin
    .from("campaign_messages")
    .update({ rendered_text: renderedText })
    .eq("id", id);
}

async function setMessageContactAndPhone(params: {
  campaignMessageId: string;
  contactId: string;
  phoneDigits: string;
}) {
  await supabaseAdmin
    .from("campaign_messages")
    .update({
      contact_id: params.contactId,
      phone: params.phoneDigits,
    })
    .eq("id", params.campaignMessageId);
}

async function setMessageConversationId(params: {
  campaignMessageId: string;
  conversationId: string;
}) {
  await supabaseAdmin
    .from("campaign_messages")
    .update({
      conversation_id: params.conversationId,
    })
    .eq("id", params.campaignMessageId);
}

async function markCampaignSending(campaignId: string, isImmediate: boolean) {
  const patch: Record<string, any> = {
    status: "sending",
    started_at: new Date().toISOString(),
  };
  if (isImmediate) patch.launched_at = new Date().toISOString();
  await supabaseAdmin.from("campaigns").update(patch).eq("id", campaignId);
}

async function markCampaignCompleted(campaignId: string) {
  await supabaseAdmin
    .from("campaigns")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", campaignId);
}

async function markCampaignFailed(campaignId: string, err: string) {
  await supabaseAdmin
    .from("campaigns")
    .update({ status: "failed" })
    .eq("id", campaignId);
  console.error("campaign failed", campaignId, err);
}

/* ============================================================
   ENSURE CONTACT EXISTS FOR CAMPAIGN MESSAGE (C1 PATCH)
============================================================ */
async function ensureContactForCampaignMessage(params: {
  organizationId: string;
  msg: CampaignMessage;
}): Promise<{ contactId: string; phoneDigits: string }> {
  const phoneDigits = normalizeToIndiaDigits(params.msg.phone);
  if (!phoneDigits) {
    throw new Error("Invalid phone");
  }

  const contact = await upsertContactByPhone({
    organizationId: params.organizationId,
    phoneDigits,
    name: null,
  });

  if (
    params.msg.contact_id !== contact.id ||
    params.msg.phone !== phoneDigits
  ) {
    await setMessageContactAndPhone({
      campaignMessageId: params.msg.id,
      contactId: contact.id,
      phoneDigits,
    });
  }

  return { contactId: contact.id, phoneDigits };
}

/* ============================================================
   ✅ PSF ADDITION — LINK MESSAGE → CONVERSATION + PSF CASE
============================================================ */
async function linkMessageToConversationAndPsf(params: {
  msg: CampaignMessage;
  contactId: string;
  campaign: Campaign;
  phoneDigits: string;
  renderedText: string;
}) {
  const conversationId = await ensureConversationForContact({
    organizationId: params.msg.organization_id,
    contactId: params.contactId,
    channel: "whatsapp",
  });


  // Persist campaign context on the conversation so the AI + Google Sheets routing
  // remain stable across multiple replies (even if the latest outbound message isn't reloaded).
  const campaignContext: any = {
    campaign_id: params.msg.campaign_id,
    campaign_message_id: params.msg.id,
    reply_sheet_tab: params.campaign.reply_sheet_tab ?? null,
    variables: {},
  };

  // Extract only mapped variables (prevents huge raw_row payloads)
  try {
    const varMap = params.campaign.meta?.variable_map ?? {};
    const raw = params.msg.raw_row ?? {};
    for (const [idx, col] of Object.entries(varMap)) {
      const v: any = (raw as any)?.[String(col)];
      campaignContext.variables[String(idx)] = v === null || v === undefined ? "" : String(v);
    }
  } catch {
    // best-effort only
  }

  // Best-effort: auto-attach a workflow by matching workflow.name to reply_sheet_tab
  // (e.g. Service / Sales / PSF). If found, start it immediately.
  let matchedWorkflowId: string | null = null;
  try {
    const tab = (params.campaign.reply_sheet_tab ?? "").trim().toLowerCase();
    if (tab) {
      const { data: wfs } = await supabaseAdmin
        .from("workflows")
        .select("id, name, is_active")
        .eq("organization_id", params.msg.organization_id)
        .eq("is_active", true);

      const match = (wfs ?? []).find((w: any) =>
        String(w.name ?? "").trim().toLowerCase() === tab
      );
      if (match?.id) matchedWorkflowId = match.id;
    }
  } catch {
    // best-effort only
  }

  // Save to conversation
  // Phase 2: seed a stable topic/model lock so short replies ("tell me more") continue the campaign thread.
  const existingConv = await supabaseAdmin
    .from("conversations")
    .select("ai_last_entities")
    .eq("id", conversationId)
    .maybeSingle();

  const seededModel =
    inferVehicleModelFromRow(params.msg.raw_row ?? null) ||
    (await supabaseAdmin
      .from("contacts")
      .select("model")
      .eq("id", params.contactId)
      .maybeSingle()
      .then((r) => (r.data as any)?.model ?? null)
      .catch(() => null));

  const seedTopic = isLikelyOfferOrPricing(params.renderedText) ? "offer_pricing" : null;

  const prevEntities = (existingConv as any)?.data?.ai_last_entities ?? null;
  const nextEntities = {
    ...(prevEntities ?? {}),
    ...(seededModel ? { model: seededModel } : {}),
    ...(seedTopic ? { topic: seedTopic, intent: "offer" } : {}),
  };

  await supabaseAdmin
    .from("conversations")
    .update({
      campaign_id: params.msg.campaign_id,
      workflow_id: matchedWorkflowId,
      campaign_context: campaignContext,
      campaign_reply_sheet_tab: params.campaign.reply_sheet_tab ?? null,
      ai_last_entities: nextEntities,
    })
    .eq("id", conversationId);

  // Start workflow log once (if matched)
  if (matchedWorkflowId) {
    const { data: existing } = await supabaseAdmin
      .from("workflow_logs")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("workflow_id", matchedWorkflowId)
      .eq("completed", false)
      .maybeSingle();

    if (!existing?.id) {
      await supabaseAdmin.from("workflow_logs").insert({
        workflow_id: matchedWorkflowId,
        conversation_id: conversationId,
        current_step_number: 1,
        variables: campaignContext.variables ?? {},
        completed: false,
      });
    }
  }

  // requires migration: campaign_messages.conversation_id
  await setMessageConversationId({
    campaignMessageId: params.msg.id,
    conversationId,
  });

  // Safe no-op for non-PSF campaigns (no matching rows)
  await supabaseAdmin
    .from("psf_cases")
    .update({ conversation_id: conversationId })
    .eq("campaign_id", params.msg.campaign_id)
    .eq("phone", params.phoneDigits);
}

function assertTemplateVariablesPresent(params: {
  template: WhatsappTemplate;
  rawRow: Record<string, any> | null;
  variableMap: Record<string, string> | undefined;
}) {
  const missing: number[] = [];

  const indices = [
    ...(params.template.header_variable_indices ?? []),
    ...(params.template.body_variable_indices ?? []),
  ];

  for (const idx of indices) {
    const col = params.variableMap?.[String(idx)];
    const val = col ? params.rawRow?.[col] : null;

    if (val === null || val === undefined || String(val).trim() === "") {
      missing.push(idx);
    }
  }

  if (missing.length > 0) {
    throw new Error(`variable_mismatch:${missing.join(",")}`);
  }
}

/* ============================================================
   DISPATCH SINGLE CAMPAIGN (IMMEDIATE MODE)
============================================================ */
async function dispatchCampaignImmediate(campaign: Campaign) {
  if (!campaign.whatsapp_template_id) return;
  if (campaign.status === "completed" || campaign.status === "cancelled")
    return;

  const template = await fetchTemplate(campaign.whatsapp_template_id);
  const schema = {
    header_variable_count: template.header_variable_count,
    header_variable_indices: template.header_variable_indices,
    body_variable_count: template.body_variable_count,
    body_variable_indices: template.body_variable_indices,
  };

  const messages = await fetchMessages(campaign.id);
  // ✅ PSF STEP 2 — create PSF cases before sending
  await createPsfCasesForCampaign({
    campaign,
    messages,
  });

  let sentGlobal = 0;
  const sentPerOrg: Record<string, number> = {};

  for (const msg of messages) {
    if (sentGlobal >= GLOBAL_MAX_MESSAGES_PER_RUN) break;

    const orgCount = sentPerOrg[msg.organization_id] ?? 0;
    if (orgCount >= ORG_RATE_LIMIT_PER_RUN) continue;

    try {
      const { contactId, phoneDigits } = await ensureContactForCampaignMessage({
        organizationId: msg.organization_id,
        msg,
      });

      const phonePlus = toE164Plus(phoneDigits);
      if (!phonePlus) {
        await markFailed(msg.id, "Invalid phone");
        continue;
      }

      // rendered text best-effort for chat UI
      let renderedText = `Template: ${template.name}`;
      try {
        if (template.body) {
          const contactRow = await fetchContact(contactId);
          renderedText = resolveTemplateText(
            template.body,
            msg.raw_row ?? {},
            campaign.meta?.variable_map ?? null
          );
        }
        await setRenderedText(msg.id, renderedText);
      } catch {
        // ignore
      }

      // Phase 2.4: media templates must have media attached
      const headerType = String(template.header_type ?? "").toUpperCase();
      const needsMedia = headerType === "IMAGE" || headerType === "DOCUMENT";
      if (needsMedia && !template.header_media_url) {
        await markFailed(msg.id, "Missing template media (header_media_url)");
        continue;
      }
      const messageType =
        headerType === "IMAGE"
          ? "image"
          : headerType === "DOCUMENT"
          ? "document"
          : "template";

      // 🚨 HARD ENFORCEMENT — NO EMPTY VARIABLES ALLOWED
      try {
        assertTemplateVariablesPresent({
          template,
          rawRow: msg.raw_row ?? null,
          variableMap: campaign.meta?.variable_map,
        });
      } catch (e) {
        await markFailed(msg.id, "variable_mismatch");
        continue;
      }

      const variables = buildWhatsappParamsFromRow({
        template,
        rawRow: msg.raw_row ?? null,
        variableMap: campaign.meta?.variable_map,
      });

      // 🚨 HARD STOP: variable mismatch (Meta will silently drop otherwise)

      const waId = await sendWhatsappTemplate({
        organizationId: msg.organization_id,
        contactId,
        phonePlusE164: phonePlus,
        templateName: template.name,
        language: template.language,

        variables,

        renderedText,

        reply_sheet_tab: campaign.reply_sheet_tab,
        campaign_id: msg.campaign_id,
        campaign_message_id: msg.id,

        templateComponents: [...buildTemplateHeaderComponents(template)],

        mediaUrl: template.header_media_url,
        mimeType: template.header_media_mime,
        messageType,
      });

      // keep your current behavior
      if (!waId) {
        await markFailed(msg.id, "meta_rejected_message");
        continue;
      }

      await markSent(msg.id, waId);

      // ✅ PSF ADDITION: link conversation + psf case
      await linkMessageToConversationAndPsf({
        msg,
        contactId,
        campaign,
        phoneDigits,
        renderedText,
      });

      sentGlobal++;
      sentPerOrg[msg.organization_id] = orgCount + 1;
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      await markFailed(msg.id, err);
    }
  }

  const { count, error } = await supabaseAdmin
    .from("campaign_messages")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaign.id)
    .in("status", ["pending", "queued"]);

  if (error) throw error;
  if ((count ?? 0) === 0) await markCampaignCompleted(campaign.id);
}

/* ============================================================
   MAIN
============================================================ */
serve(async (req: Request) => {
  const request_id = getRequestId(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // PHASE 1 AUTHZ: internal-only worker endpoint
  if (!isInternalRequest(req)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const nowIso = new Date().toISOString();

    let body: any = {};
    if (req.method === "POST") {
      body = await req.json().catch(() => ({}));
    }

    const mode: DispatchMode = body?.mode ?? "scheduled";
    const immediateCampaignId: string | undefined = body?.campaign_id;

    /* ===========================
       IMMEDIATE MODE (Launch Now)
    ============================ */
    if (mode === "immediate") {
      if (!immediateCampaignId) {
        return new Response(
          JSON.stringify({
            error: "campaign_id is required for mode=immediate",
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }

      const campaign = await fetchCampaignById(immediateCampaignId);
      if (!campaign) {
        return new Response(JSON.stringify({ error: "Campaign not found" }), {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        });
      }

      if (campaign.status === "sending" || campaign.status === "completed") {
        return new Response(
          JSON.stringify({ error: "Campaign already sent or in progress" }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }

      await markCampaignSending(campaign.id, true);

      try {
        await dispatchCampaignImmediate({ ...campaign, status: "sending" });
        return new Response(
          JSON.stringify({
            success: true,
            mode: "immediate",
            campaign_id: campaign.id,
          }),
          {
            status: 200,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      } catch (e) {
        await markCampaignFailed(
          campaign.id,
          e instanceof Error ? e.message : String(e)
        );
        return new Response(
          JSON.stringify({ error: "Dispatch failed", details: String(e) }),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }
    }

    /* ===========================
       SCHEDULED MODE (Runner)
    ============================ */
    const campaigns = await fetchEligibleCampaigns(nowIso);

    let globalSent = 0;
    const sentPerOrg: Record<string, number> = {};
    let campaignsProcessed = 0;

    for (const campaign of campaigns) {
      if (campaignsProcessed >= MAX_CAMPAIGNS_PER_RUN) break;
      if (!campaign.whatsapp_template_id) continue;

      if (campaign.status === "scheduled") {
        await markCampaignSending(campaign.id, false);
      }

      const template = await fetchTemplate(campaign.whatsapp_template_id);
      const schema = {
        header_variable_count: template.header_variable_count,
        header_variable_indices: template.header_variable_indices,
        body_variable_count: template.body_variable_count,
        body_variable_indices: template.body_variable_indices,
      };

      const messages = await fetchMessages(campaign.id);
      // ✅ PSF STEP 2 — create PSF cases before sending
      await createPsfCasesForCampaign({
        campaign,
        messages,
      });

      for (const msg of messages) {
        if (globalSent >= GLOBAL_MAX_MESSAGES_PER_RUN) break;

        const orgCount = sentPerOrg[msg.organization_id] ?? 0;
        if (orgCount >= ORG_RATE_LIMIT_PER_RUN) continue;

        try {
          const { contactId, phoneDigits } =
            await ensureContactForCampaignMessage({
              organizationId: msg.organization_id,
              msg,
            });

          const phonePlus = toE164Plus(phoneDigits);
          if (!phonePlus) {
            await markFailed(msg.id, "Invalid phone");
            continue;
          }

          // rendered text best-effort for UI
          let renderedText = `Template: ${template.name}`;
          try {
            if (template.body) {
              const contactRow = await fetchContact(contactId);
              renderedText = resolveTemplateText(
                template.body,
                msg.raw_row ?? {},
                campaign.meta?.variable_map ?? null
              );
            }
            await setRenderedText(msg.id, renderedText);
          } catch {
            // ignore
          }

          // Phase 2.4: media templates must have media attached
          const headerType = String(template.header_type ?? "").toUpperCase();
          const needsMedia =
            headerType === "IMAGE" || headerType === "DOCUMENT";
          if (needsMedia && !template.header_media_url) {
            await markFailed(
              msg.id,
              "Missing template media (header_media_url)"
            );
            continue;
          }
          const messageType =
            headerType === "IMAGE"
              ? "image"
              : headerType === "DOCUMENT"
              ? "document"
              : "template";

          // 🚨 HARD ENFORCEMENT — NO EMPTY VARIABLES ALLOWED
          try {
            assertTemplateVariablesPresent({
              template,
              rawRow: msg.raw_row ?? null,
              variableMap: campaign.meta?.variable_map,
            });
          } catch (e) {
            await markFailed(msg.id, "variable_mismatch");
            continue;
          }

          const variables = buildWhatsappParamsFromRow({
            template,
            rawRow: msg.raw_row ?? null,
            variableMap: campaign.meta?.variable_map,
          });

          const waId = await sendWhatsappTemplate({
            organizationId: msg.organization_id,
            contactId,
            phonePlusE164: phonePlus,
            templateName: template.name,
            language: template.language,

            variables,

            renderedText,

        reply_sheet_tab: campaign.reply_sheet_tab,
        campaign_id: msg.campaign_id,
        campaign_message_id: msg.id,

            templateComponents: [...buildTemplateHeaderComponents(template)],

            mediaUrl: template.header_media_url,
            mimeType: template.header_media_mime,
            messageType,
          });

          if (!waId) {
            await markFailed(msg.id, "meta_rejected_message");
            continue;
          }

          await markSent(msg.id, waId);
          // ✅ PSF ADDITION: link conversation + psf case
          await linkMessageToConversationAndPsf({ msg, contactId, campaign, phoneDigits, renderedText });

          globalSent++;
          sentPerOrg[msg.organization_id] = orgCount + 1;
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e);
          await markFailed(msg.id, err);
        }
      }

      const { count, error } = await supabaseAdmin
        .from("campaign_messages")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaign.id)
        .in("status", ["pending", "queued"]);

      if (error) throw error;
      if ((count ?? 0) === 0) await markCampaignCompleted(campaign.id);

      campaignsProcessed++;
    }

    return new Response(
      JSON.stringify({
        success: true,
        mode: "scheduled",
        campaigns_processed: campaignsProcessed,
        messages_dispatched: globalSent,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (e) {
    console.error("campaign-dispatch fatal", e);
    return new Response(
      JSON.stringify({ error: "Internal Error", details: String(e) }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
