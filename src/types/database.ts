// src/types/database.ts
// FINAL — Canonical UI Domain Types
// Derived strictly from generated Supabase schema
// ⚠️ Never reference tables/views that do not exist in supabase.ts

import type { Database } from "./supabase";

/* ============================================================
   HELPERS
============================================================ */

export type UUID = string;

export type PublicTableRow<
  T extends keyof Database["public"]["Tables"]
> = Database["public"]["Tables"][T]["Row"];

/* ============================================================
   CORE DOMAIN
============================================================ */

export type Organization = PublicTableRow<"organizations">;
export type OrganizationUser = PublicTableRow<"organization_users">;

export type Contact = PublicTableRow<"contacts">;
export type Message = PublicTableRow<"messages">;

/* ============================================================
   KNOWLEDGE BASE
============================================================ */

export type KnowledgeArticle = PublicTableRow<"knowledge_articles">;
export type UnansweredQuestion = PublicTableRow<"unanswered_questions">;

/* ============================================================
   BOT CONFIG
============================================================ */

export type BotPersonality = PublicTableRow<"bot_personality">;
export type BotInstruction = PublicTableRow<"bot_instructions">;

/* ============================================================
   WORKFLOWS
============================================================ */

export type Workflow = PublicTableRow<"workflows">;
export type WorkflowStep = PublicTableRow<"workflow_steps">;
export type WorkflowLog = PublicTableRow<"workflow_logs">;

/* ============================================================
   CAMPAIGNS
============================================================ */

export type Campaign = PublicTableRow<"campaigns">;
export type CampaignMessage = PublicTableRow<"campaign_messages">;

/* ============================================================
   WHATSAPP
============================================================ */

export type WhatsappSettings = PublicTableRow<"whatsapp_settings">;

/* ============================================================
   UI-ONLY ENUMS (NOT DB)
============================================================ */

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
    id: string;
    organization_id: string;
    channel: "whatsapp" | "web" | "internal";
    contact_id: string | null;
  
    assigned_to: string | null;
  
    ai_enabled: boolean | null;
    ai_mode?: "auto" | "suggest" | "off" | null;
  
    /* 🔒 AI TAKEOVER (PHASE 4.1) */
    ai_locked?: boolean | null;
    ai_locked_by?: string | null;
    ai_locked_at?: string | null;
    ai_lock_reason?: string | null;
  
    created_at: string;
    updated_at?: string;
  
    /* ---------------- UI-ONLY JOINED DATA ---------------- */
    contact?: {
      id: string;
      name: string | null;
      phone: string | null;
    } | null;
  
    meta?: {
      psf_case_id?: string | null;
    } | null;
  };
  

export type MessageSender = "user" | "bot" | "customer";

export type PsfResolutionStatus =
  | "open"
  | "resolved"
  | "closed"
  | "escalated";

  export type PsfSentiment = "positive" | "negative" | "neutral" | null;

  export type PsfCase = {
    id: string;
    organization_id: string;
  
    campaign_id: string;
    campaign_name: string | null;
  
    conversation_id: string | null;
    phone: string;
  
    uploaded_data: Record<string, any>;
  
    sentiment: "positive" | "negative" | "neutral" | null;
    ai_summary: string | null;
  
    action_required: boolean;
    resolution_status: "open" | "resolved";
  
    initial_sent_at: string | null;
    reminder_sent_at: string | null;
    last_reminder_sent_at: string | null;
    reminders_sent_count: number | null;
  
    last_customer_reply_at: string | null;
  
    created_at: string;
    updated_at: string;
  };
  
