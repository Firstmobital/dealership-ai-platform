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
  name: string | null;
  labels: Record<string, unknown> | null;
  created_at?: string;
};

// -------------------------------------------------------------
// CONVERSATIONS + MESSAGES
// -------------------------------------------------------------
export type ConversationChannel = "web" | "whatsapp" | "internal";

export type Conversation = {
  id: UUID;
  organization_id: UUID;
  contact_id: UUID;
  assigned_to: UUID | null;
  ai_enabled: boolean;
  last_message_at: string | null;
  channel: ConversationChannel;
  sub_organization_id: UUID | null;
  created_at?: string;
};

export type MessageSender = "user" | "bot" | "customer";

export type Message = {
  id: UUID;
  conversation_id: UUID;
  sender: MessageSender;
  message_type: string;
  text: string | null;
  media_url: string | null;
  created_at: string;
  channel: ConversationChannel;
  sub_organization_id: UUID | null;
  mime_type: string | null;
  whatsapp_message_id: string | null;
  wa_received_at: string | null;
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
  id: string;
  organization_id: string;
  sub_organization_id: string | null;
  name: string;
  description: string | null;
  trigger: any;

  // Expanded modes
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
// CAMPAIGNS (NEW BULK MESSAGING SYSTEM)
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
// WHATSAPP SETTINGS (FINAL SCHEMA)
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
