import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { createLogger } from "./logging.ts";

type AiExtractLike = {
  vehicle_model?: string | null;
};

type LeadWriterParams = {
  conversation_id: string;
  organization_id: string;
  contactPhone: string | null;
  aiExtract: AiExtractLike | null;
  supabase: SupabaseClient;
  operationalSupabase: SupabaseClient;
};

type ConversationRow = {
  id: string;
  organization_id: string;
  contact_id: string | null;
  customer_reply_count: number | null;
};

type ContactRow = {
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

type MessageRow = {
  sender: string | null;
  text: string | null;
  created_at: string | null;
};

const TRANSCRIPT_MESSAGE_LIMIT = 20;

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function messageSpeaker(sender: string | null): "Customer" | "AI" {
  const normalized = String(sender ?? "").trim().toLowerCase();
  if (normalized === "customer") {
    return "Customer";
  }
  return "AI";
}

function getTranscriptMessages(messages: MessageRow[]): MessageRow[] {
  return [...messages]
    .filter((message) => normalizeText(message.text))
    .sort((left, right) => {
      const leftTs = Date.parse(String(left.created_at ?? ""));
      const rightTs = Date.parse(String(right.created_at ?? ""));

      if (!Number.isFinite(leftTs) && !Number.isFinite(rightTs)) return 0;
      if (!Number.isFinite(leftTs)) return 1;
      if (!Number.isFinite(rightTs)) return -1;

      return leftTs - rightTs;
    })
    .slice(-TRANSCRIPT_MESSAGE_LIMIT);
}

function buildTranscript(messages: MessageRow[]): string {
  return messages
    .map((message) => {
      const text = normalizeText(message.text);
      if (!text) return null;
      return `${messageSpeaker(message.sender)}: ${text}`;
    })
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function buildConversationSummary(messages: MessageRow[]): string {
  const lines = messages
    .map((message) => {
      const text = normalizeText(message.text);
      if (!text) return null;
      return `${messageSpeaker(message.sender)}: ${text}`;
    })
    .filter((line): line is string => Boolean(line));

  const summary = lines.slice(-6).join(" | ");
  return summary.length > 500 ? `${summary.slice(0, 497)}...` : summary;
}

function resolveCustomerName(contact: ContactRow | null, fallbackPhone: string): string {
  const directName = asNonEmptyString(contact?.name);
  if (directName) return directName;

  const fullName = [contact?.first_name, contact?.last_name]
    .map((value) => asNonEmptyString(value))
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .trim();

  return fullName || fallbackPhone;
}

export async function maybeCreateAILead(params: LeadWriterParams): Promise<void> {
  const logger = createLogger({
    request_id: "ai_lead_writer",
    conversation_id: params.conversation_id,
    organization_id: params.organization_id,
  });

  try {
    const { data: conversation, error: conversationError } = await params.supabase
      .from("conversations")
      .select("id, organization_id, contact_id, customer_reply_count")
      .eq("organization_id", params.organization_id)
      .eq("id", params.conversation_id)
      .maybeSingle<ConversationRow>();

    if (conversationError) {
      logger.warn("[ai-lead] failed to load conversation", { error: conversationError });
      return;
    }

    if (!conversation) {
      logger.info("[ai-lead] skipped: conversation not found");
      return;
    }

    const customerReplyCount = Number(conversation.customer_reply_count ?? 0);
    if (!Number.isFinite(customerReplyCount) || customerReplyCount < 2) {
      logger.info("[ai-lead] skipped because reply count < 2", {
        customer_reply_count: customerReplyCount,
      });
      return;
    }

    const phoneNumber = asNonEmptyString(params.contactPhone);
    if (!phoneNumber) {
      logger.info("[ai-lead] skipped because phone missing");
      return;
    }

    const { data: existingLead, error: existingLeadError } = await params.operationalSupabase
      .from("ai_leads")
      .select("source_conversation_id")
      .eq("source_conversation_id", params.conversation_id)
      .limit(1)
      .maybeSingle<{ source_conversation_id: string }>();

    if (existingLeadError) {
      logger.warn("[ai-lead] failed to check existing lead", { error: existingLeadError });
      return;
    }

    if (existingLead) {
      logger.info("[ai-lead] skipped because lead already exists");
      return;
    }

    const { data: messages, error: messagesError } = await params.supabase
      .from("messages")
      .select("sender, text, created_at")
      .eq("organization_id", params.organization_id)
      .eq("conversation_id", params.conversation_id)
      .order("created_at", { ascending: true });

    if (messagesError) {
      logger.warn("[ai-lead] failed to load messages", { error: messagesError });
      return;
    }

    const orderedMessages = Array.isArray(messages)
      ? getTranscriptMessages(messages as MessageRow[])
      : [];

    if (orderedMessages.length === 0) {
      logger.info("[ai-lead] skipped: no transcriptable messages");
      return;
    }

    let customerName = phoneNumber;

    if (conversation.contact_id) {
      const { data: contact, error: contactError } = await params.supabase
        .from("contacts")
        .select("name, first_name, last_name")
        .eq("organization_id", params.organization_id)
        .eq("id", conversation.contact_id)
        .maybeSingle<ContactRow>();

      if (contactError) {
        logger.warn("[ai-lead] failed to load contact", { error: contactError });
      } else {
        customerName = resolveCustomerName(contact ?? null, phoneNumber);
      }
    }

    const fullConversation = buildTranscript(orderedMessages);
    if (!fullConversation) {
      logger.info("[ai-lead] skipped: empty transcript after normalization");
      return;
    }

    const conversationSummary = buildConversationSummary(orderedMessages);
    const interestedModel = asNonEmptyString(params.aiExtract?.vehicle_model);

    const { error: insertError } = await params.operationalSupabase
      .from("ai_leads")
      .insert({
        customer_name: customerName,
        mobile_number: phoneNumber,
        model_name: interestedModel,
        source_conversation_id: params.conversation_id,
        conversation_summary: conversationSummary,
        conversation_transcript: fullConversation,
        lead_source: "AI Chatbot",
        opty_status: "pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (insertError) {
      logger.error("[ai-lead] creation failed", { error: insertError });
      return;
    }

    logger.info("[ai-lead] successfully created", {
      interested_model: interestedModel,
      message_count: orderedMessages.length,
    });
  } catch (error) {
    logger.error("[ai-lead] creation failed", { error });
  }
}