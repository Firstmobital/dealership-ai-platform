///Users/air/dealership-ai-platform/src/types/database.ts
/// src/types/database.ts

// -------------------------------------------------------------
// GLOBAL TYPES
// -------------------------------------------------------------
export type UUID = string;

// -------------------------------------------------------------
// SUB-ORGANIZATIONS
// -------------------------------------------------------------
export type SubOrganization = {
  id: UUID;
  organization_id: UUID;
  name: string;
  slug: string;
  description: string | null;
  created_at?: string;
};

export type SubOrganizationUser = {
  id: UUID;
  sub_organization_id: UUID;
  user_id: UUID;
  role: "admin" | "agent" | "viewer" | string;
  created_at?: string;
};

// -------------------------------------------------------------
// ORGANIZATIONS
// -------------------------------------------------------------
export type Organization = {
  id: UUID;
  name: string;
  logo_url: string | null;
  type: string | null;
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

  name: string | null;
  labels: Record<string, unknown> | null;

  created_at?: string;
};

// -------------------------------------------------------------
// CONVERSATIONS + MESSAGES
// -------------------------------------------------------------
export type ConversationChannel = "web" | "whatsapp" | "internal";
export type ConversationIntent =
  | "sales"
  | "service"
  | "finance"
  | "accessories"
  | "general";

export type Conversation = {
  id: UUID;
  organization_id: UUID;

  contact_id: UUID | null; // ✅ nullable (important)
  assigned_to: UUID | null;

  ai_enabled: boolean;
  intent?: ConversationIntent; // ✅ PHASE 1B FIX

  last_message_at: string | null;
  channel: ConversationChannel;
  sub_organization_id: UUID | null;

  created_at?: string;

  // Joined contact (normalized in store)
  contact?: Pick<
    Contact,
    "id" | "phone" | "name" | "first_name" | "last_name" | "model"
  > | null;
};

export type MessageSender = "user" | "bot" | "customer";

export type Message = {
  id: UUID;
  conversation_id: UUID;

  sender: MessageSender;
  message_type: string;

  text: string | null;
  media_url: string | null;
  mime_type: string | null;

  channel: ConversationChannel;
  sub_organization_id: UUID | null;

  whatsapp_message_id: string | null;
  wa_received_at: string | null;

  created_at: string;
};

// -------------------------------------------------------------
// KNOWLEDGE BASE + RAG
// -------------------------------------------------------------
export type KnowledgeArticle = {
  id: UUID;
  organization_id: UUID;
  title: string;
  description: string | null;
  content: string;
  created_at: string;
  updated_at: string;
  sub_organization_id: UUID | null;
};

export type KnowledgeChunk = {
  id: UUID;
  article_id: UUID;
  chunk: string;
  embedding: number[];
  created_at?: string;
  sub_organization_id: UUID | null;
};

export type UnansweredQuestion = {
  id: UUID;
  organization_id: UUID;
  question: string;
  occurrences: number;
  created_at?: string;
};

// -------------------------------------------------------------
// BOT PERSONALITY + INSTRUCTIONS
// -------------------------------------------------------------
export type BotPersonality = {
  organization_id: UUID;
  tone: string;
  language: string;
  short_responses: boolean;
  emoji_usage: boolean;
  gender_voice: string;
  fallback_message: string;
  sub_organization_id: UUID | null;
};

export type BotInstruction = {
  id: UUID;
  organization_id: UUID;
  rules: Record<string, unknown>;
  sub_organization_id: UUID | null;
  created_at?: string;
};

// -------------------------------------------------------------
// WORKFLOWS
// -------------------------------------------------------------
export type Workflow = {
  id: UUID;
  organization_id: UUID;
  sub_organization_id: UUID | null;

  name: string;
  description: string | null;
  trigger: any;

  mode: "auto" | "manual" | "smart" | "strict";
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
  sub_organization_id: UUID | null;

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
  | "cancelled";

export type CampaignMessage = {
  id: UUID;
  organization_id: UUID;
  sub_organization_id: UUID | null;

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
// AI HANDLER RESPONSES
// -------------------------------------------------------------
export type AIReplyResponse = {
  conversation_id: UUID;
  ai_response?: string;
  no_reply?: boolean;
  forced_kb?: boolean;
  request_id: string;
};

export type AIFollowupSuggestionResponse = {
  conversation_id: UUID;
  suggestion: string;
  request_id: string;
};

// -------------------------------------------------------------
// CONVERSATION META (FUTURE SAFE)
// -------------------------------------------------------------
export type ConversationHeat = "hot" | "warm" | "cold" | "neutral";

// -------------------------------------------------------------
// CONTACT → CAMPAIGN SUMMARY VIEW
// -------------------------------------------------------------
export type ContactCampaignSummary = {
  contact_id: UUID;
  organization_id: UUID;

  first_name: string | null;
  last_name: string | null;
  phone: string;
  model: string | null;

  delivered_campaigns: string[];
  failed_campaigns: string[];
};

// -------------------------------------------------------------
// WHATSAPP SETTINGS
// -------------------------------------------------------------
export type WhatsappSettings = {
  id: UUID;
  organization_id: UUID;
  sub_organization_id: UUID | null;

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
    sub_organization_id: UUID | null;
  
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
  };
  