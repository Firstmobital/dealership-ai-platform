export type UUID = string;

export type Organization = {
  id: UUID;
  name: string;
  logo_url: string | null;
  type: string | null;
};

export type OrganizationUser = {
  id: UUID;
  organization_id: UUID;
  user_id: UUID;
  role: 'owner' | 'admin' | 'agent';
};

export type Contact = {
  id: UUID;
  organization_id: UUID;
  phone: string;
  name: string | null;
  labels: Record<string, unknown> | null;
};

export type Conversation = {
  id: UUID;
  organization_id: UUID;
  contact_id: UUID;
  assigned_to: UUID | null;
  ai_enabled: boolean;
  last_message_at: string | null;
};

export type MessageSender = 'user' | 'bot' | 'customer';

export type Message = {
  id: UUID;
  conversation_id: UUID;
  sender: MessageSender;
  message_type: string;
  text: string | null;
  media_url: string | null;
  created_at: string;
};

export type KnowledgeArticle = {
  id: UUID;
  organization_id: UUID;
  title: string;
  description: string | null;
  content: string;
  created_at: string;
  updated_at: string;
};

export type KnowledgeChunk = {
  id: UUID;
  article_id: UUID;
  chunk: string;
  embedding: number[];
};

export type UnansweredQuestion = {
  id: UUID;
  organization_id: UUID;
  question: string;
  occurrences: number;
};

export type BotPersonality = {
  organization_id: UUID;
  tone: string;
  language: string;
  short_responses: boolean;
  emoji_usage: boolean;
  gender_voice: string;
  fallback_message: string;
};

export type BotInstruction = {
  id: UUID;
  organization_id: UUID;
  rules: Record<string, unknown>;
};

export type Workflow = {
  id: UUID;
  organization_id: UUID;
  name: string;
  description: string | null;
  trigger: Record<string, unknown> | null;
};

export type WorkflowStep = {
  id: UUID;
  workflow_id: UUID;
  step_order: number;
  action: Record<string, unknown>;
};

export type WorkflowLog = {
  id: UUID;
  workflow_id: UUID;
  conversation_id: UUID | null;
  step_id: UUID | null;
  data: Record<string, unknown> | null;
  created_at?: string;
};

export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'completed' | 'failed';

export type Campaign = {
  id: UUID;
  organization_id: UUID;
  name: string;
  template_id: string | null;
  total_contacts: number;
  sent_count: number;
  status: CampaignStatus;
};

export type CampaignContact = {
  id: UUID;
  campaign_id: UUID;
  contact_id: UUID;
  variables: Record<string, unknown> | null;
};

export type CampaignLog = {
  id: UUID;
  campaign_id: UUID;
  contact_id: UUID;
  status: string;
  response: Record<string, unknown> | null;
  created_at?: string;
};
