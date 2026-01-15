// src/types/database.ts

// -------------------------------------------------------------
// GLOBAL TYPES
// -------------------------------------------------------------
export type UUID = string;

// -------------------------------------------------------------
// ORGANIZATIONS
// -------------------------------------------------------------
export type Organization = {
  id: UUID;
  name: string;
  logo_url: string | null;
  type: string | null;
  google_sheet_id?: string | null;
  created_at?: string;
};

export type OrganizationUser = {
  id: UUID;
  organization_id: UUID;
  user_id: UUID;
  role: "owner" | "admin" | "agent";
  created_at?: string;
};

// -------------------------------------------------------------
// CONTACTS
// -------------------------------------------------------------
export type Contact = {
  id: UUID;
  organization_id: UUID;

  phone: string;

  first_name: string | null;
  last_name: string | null;
  model: string | null;
  metadata?: Record<string, unknown>;

  name: string | null;
  labels: Record<string, unknown> | null;

  created_at?: string;
};

// -------------------------------------------------------------
// CONVERSATIONS + MESSAGES
// -------------------------------------------------------------
export type ConversationChannel =
  | "web"
  | "whatsapp"
  | "internal"
  | "psf";

export type ConversationIntent =
  | "sales"
  | "service"
  | "finance"
  | "accessories"
  | "general";

export type Conversation = {
  id: UUID;
  organization_id: UUID;

  contact_id: UUID | null;
  assigned_to: UUID | null;

  ai_enabled: boolean | null;

  intent?: ConversationIntent | null;
  intent_source?: "ai" | "manual" | null;

  // ✅ AI mode (phase 1)
  ai_mode?: "auto" | "suggest" | "off" | null;

  // ✅ AI lock (phase 4.1 takeover)
  ai_locked?: boolean | null;
  ai_locked_by?: UUID | null;
  ai_locked_at?: string | null;
  ai_lock_reason?: string | null;

  // (optional) state machine if you’re adding it later
  state?:
    | "ai_active"
    | "agent_active"
    | "psf_pending"
    | "psf_waiting_customer"
    | "resolved"
    | "archived"
    | null;

  last_message_at: string | null;
  channel: ConversationChannel;

  meta?: Record<string, unknown> | null;

  created_at?: string;

  contact?: Pick<
    Contact,
    "id" | "phone" | "name" | "first_name" | "last_name" | "model"
  > | null;
};

export type MessageSender = "user" | "bot" | "customer" | "agent";

export type Message = {
  id: UUID;
  conversation_id: UUID;

  sender: MessageSender;
  message_type: string;

  text: string | null;
  media_url: string | null;
  mime_type: string | null;

  channel: ConversationChannel;

  whatsapp_message_id: string | null;
  wa_received_at: string | null;

  // WhatsApp delivery/read receipts (optional)
  whatsapp_status?: string | null;
  sent_at?: string | null;
  delivered_at?: string | null;
  read_at?: string | null;
  metadata: Record<string, any> | null;

  created_at: string;
};

// -------------------------------------------------------------
// KNOWLEDGE BASE + RAG
// -------------------------------------------------------------
export type KnowledgeArticle = {
  id: UUID;
  organization_id: UUID;

  title: string;
  content: string;

  status: "draft" | "published" | "archived";
  published_at?: string | null;
  updated_by?: string | null;

  source_type: "text" | "file";
  keywords?: string[] | null;

  file_bucket?: string | null;
  file_path?: string | null;
  original_filename?: string | null;
  mime_type?: string | null;

  processing_status:
    | "extracting_text"
    | "ocr_fallback"
    | "saving"
    | "completed"
    | "failed"
    | null;

  created_at: string;
  updated_at?: string | null;
  last_processed_at?: string | null;
  processing_error?: string | null;
};

export type KnowledgeChunk = {
  id: UUID;
  organization_id?: UUID;
  article_id: UUID;
  chunk_index?: number;
  chunk: string;
  embedding: number[];
  created_at?: string;
};

export type UnansweredQuestion = {
  id: UUID;
  organization_id: UUID;

  question: string;
  occurrences: number;

  status: "open" | "answered" | "ignored";

  resolution_article_id: UUID | null;
  resolved_at: string | null;
  resolved_by: UUID | null;

  ai_response: string | null;

  created_at: string;
};

// -------------------------------------------------------------
// BOT PERSONALITY + INSTRUCTIONS
// -------------------------------------------------------------
export type BotPersonality = {
  id: UUID;
  organization_id: UUID;

  tone: string;
  language: string;
  short_responses: boolean;
  emoji_usage: boolean;
  gender_voice: string;
  fallback_message: string;

  business_context: string;
  dos: string;
  donts: string;

  created_at?: string;
  updated_at?: string;
};

export type BotInstruction = {
  id: UUID;
  organization_id: UUID;
  rules: Record<string, unknown>;
  created_at?: string;
};

// -------------------------------------------------------------
// WORKFLOWS
// -------------------------------------------------------------
export type Workflow = {
  id: UUID;
  organization_id: UUID;

  name: string;
  description: string | null;
  trigger: any;

  mode: "smart" | "strict";
  is_active: boolean;

  created_at: string;
  updated_at: string;
};

export type WorkflowStep = {
  id: UUID;
  workflow_id: UUID;
  step_order: number;
  action: Record<string, unknown>;
  created_at?: string;
};

export type WorkflowLog = {
  id: UUID;
  workflow_id: UUID;
  conversation_id: UUID | null;
  step_id: UUID | null;
  data: Record<string, unknown> | null;
  created_at?: string;
};

// -------------------------------------------------------------
// CAMPAIGNS
// -------------------------------------------------------------
export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "completed"
  | "cancelled"
  | "failed";

export type Campaign = {
  id: UUID;
  organization_id: UUID;

  name: string;
  whatsapp_template_id: UUID | null;
  template_name: string | null;

  description: string | null;
  channel: "whatsapp";

  status: CampaignStatus;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;

  template_body: string;
  template_variables: string[] | null;

  reply_sheet_tab?: string | null;

  total_recipients: number;
  sent_count: number;
  failed_count: number;

  created_by: UUID | null;
  created_at?: string;
  updated_at?: string;
};

// -------------------------------------------------------------
// CAMPAIGN MESSAGES
// -------------------------------------------------------------
export type CampaignMessageStatus =
  | "pending"
  | "queued"
  | "sent"
  | "delivered"
  | "failed"
  | "read"
  | "cancelled";

export type CampaignMessage = {
  id: UUID;
  organization_id: UUID;

  campaign_id: UUID;
  contact_id: UUID | null;

  phone: string;
  variables: Record<string, unknown> | null;

  status: CampaignMessageStatus;
  error: string | null;

  whatsapp_message_id: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;

  created_at?: string;
};

// -------------------------------------------------------------
// PSF (POST SERVICE FEEDBACK)
// -------------------------------------------------------------

export type PsfSentiment = "positive" | "negative" | "neutral" | "no_reply";

export type PsfResolutionStatus = "open" | "resolved" | "escalated";

export type PsfCase = {
  id: string;
  organization_id: string;
  campaign_id: string;
  phone: string;

  // ✅ Identity
  customer_name: string | null;
  model: string | null;

  // ✅ Status
  resolution_status: PsfResolutionStatus;
  action_required: boolean;

  // ✅ Timing
  initial_sent_at: string | null;
  last_customer_reply_at: string | null;
  resolved_at: string | null;

  // ✅ Counters
  reminders_sent_count: number | null;

  // ✅ Relations
  conversation_id: string | null;
  campaign_name: string | null;
};


// -------------------------------------------------------------
// WHATSAPP SETTINGS + TEMPLATES
// -------------------------------------------------------------
export type WhatsappSettings = {
  id: UUID;
  organization_id: UUID;

  phone_number: string | null;
  api_token: string | null;
  verify_token: string | null;

  whatsapp_phone_id: string | null;
  whatsapp_business_id: string | null;

  is_active: boolean;

  created_at?: string;
  updated_at?: string;
};

export type WhatsappTemplateStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected";

export type WhatsappTemplate = {
  id: UUID;
  organization_id: UUID;

  name: string;
  category: string | null;
  language: string | null;

  header_type: "TEXT" | "IMAGE" | "DOCUMENT" | "VIDEO" | null;
  header_text: string | null;

  body: string | null;
  footer: string | null;

  status: WhatsappTemplateStatus;
  meta_template_id: string | null;

  header_media_url: string | null;
  header_media_mime: string | null;

  created_at: string;
  updated_at: string;

    // ---------------------------------------------------------
  // VARIABLE TEMPLATE SCHEMA (HARDENED)
  // ---------------------------------------------------------
  header_variable_count: number;
  header_variable_indices: number[] | null;

  body_variable_count: number;
  body_variable_indices: number[] | null;

};

// -------------------------------------------------------------
// AI CONFIGURATION + USAGE
// -------------------------------------------------------------
export type AIProvider = "openai" | "gemini";
export type KBSearchType =
  | "default"
  | "hybrid"
  | "title"
  | "deterministic"
  | "vector";

export type AISettings = {
  id: UUID;
  organization_id: UUID;

  ai_enabled: boolean;
  provider: AIProvider;
  model: string;
  kb_search_type: KBSearchType;

  created_at?: string;
  updated_at?: string;
};

export type AIUsageLog = {
  id: UUID;
  organization_id: UUID;
  conversation_id: UUID | null;
  message_id: UUID | null;

  provider: AIProvider | string;
  model: string;

  input_tokens: number;
  output_tokens: number;

  estimated_cost: number;
  charged_amount: number;

  wallet_transaction_id: UUID | null;

  created_at: string;
};

// -------------------------------------------------------------
// WALLET
// -------------------------------------------------------------
export type Wallet = {
  id: UUID;
  organization_id: UUID;
  balance: number;
  currency: string;
  status: "active" | "inactive" | "suspended";
};

export type WalletTransaction = {
  id: UUID;
  wallet_id: UUID;

  type: "credit" | "debit" | "adjustment";
  direction: "in" | "out";

  amount: number;

  reference_type: "ai_usage" | "manual" | "system" | null;
  reference_id: UUID | null;

  metadata: Record<string, unknown>;

  created_at: string;
};