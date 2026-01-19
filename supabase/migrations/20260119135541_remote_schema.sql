create extension if not exists "pg_cron" with schema "pg_catalog";

drop extension if exists "pg_net";

drop extension if exists "pg_stat_statements";

create extension if not exists "http" with schema "public";

create extension if not exists "pg_net" with schema "public";

create extension if not exists "vector" with schema "public";

create type "public"."campaign_message_status" as enum ('pending', 'queued', 'sent', 'delivered', 'failed', 'cancelled', 'read');

create type "public"."campaign_status" as enum ('draft', 'scheduled', 'sending', 'completed', 'cancelled', 'failed');

create type "public"."message_sender" as enum ('user', 'bot', 'customer', 'agent');

create type "public"."psf_resolution_status" as enum ('open', 'resolved');

create type "public"."psf_sentiment" as enum ('positive', 'neutral', 'negative', 'no_reply');


  create table "public"."ai_embeddings_cache" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null,
    "model" text not null,
    "text_hash" text not null,
    "embedding" public.vector(1536) not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."ai_embeddings_cache" enable row level security;


  create table "public"."ai_org_rate_limit_usage" (
    "organization_id" uuid not null,
    "window_start" timestamp with time zone not null,
    "request_count" integer not null default 0,
    "token_count" integer not null default 0
      );


alter table "public"."ai_org_rate_limit_usage" enable row level security;


  create table "public"."ai_org_rate_limits" (
    "organization_id" uuid not null,
    "enabled" boolean not null default true,
    "window_seconds" integer not null default 60,
    "max_requests" integer not null default 120,
    "max_tokens" integer not null default 60000,
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."ai_org_rate_limits" enable row level security;


  create table "public"."ai_settings" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null,
    "ai_enabled" boolean not null default true,
    "provider" text not null,
    "model" text not null,
    "kb_search_type" text not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."ai_settings" enable row level security;


  create table "public"."ai_turn_traces" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null,
    "conversation_id" uuid,
    "request_id" text,
    "channel" text,
    "caller_type" text,
    "input_message_id" uuid,
    "output_message_id" uuid,
    "user_text" text,
    "intent" text,
    "workflow_id" uuid,
    "kb_used" boolean not null default false,
    "kb_reason" text,
    "kb_threshold" numeric,
    "kb_top_score" numeric,
    "kb_chunks" jsonb not null default '[]'::jsonb,
    "model_provider" text,
    "model_name" text,
    "prompt_hash" text,
    "prompt_tokens" integer,
    "completion_tokens" integer,
    "total_tokens" integer,
    "estimated_cost_usd" numeric,
    "decision" jsonb not null default '{}'::jsonb,
    "error_stage" text,
    "error" jsonb,
    "status" text not null default 'started'::text,
    "started_at" timestamp with time zone not null default now(),
    "finished_at" timestamp with time zone
      );


alter table "public"."ai_turn_traces" enable row level security;


  create table "public"."ai_usage_logs" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null,
    "conversation_id" uuid,
    "message_id" uuid,
    "provider" text not null,
    "model" text not null,
    "input_tokens" integer not null default 0,
    "output_tokens" integer not null default 0,
    "total_tokens" integer not null default 0,
    "estimated_cost" numeric(10,4) not null default 0,
    "created_at" timestamp with time zone not null default now(),
    "charged_amount" numeric(10,4) not null default 0,
    "wallet_transaction_id" uuid
      );


alter table "public"."ai_usage_logs" enable row level security;


  create table "public"."audit_logs" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null,
    "actor_user_id" uuid,
    "actor_email" text,
    "action" text not null,
    "entity_type" text not null,
    "entity_id" uuid,
    "before_state" jsonb,
    "after_state" jsonb,
    "metadata" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."audit_logs" enable row level security;


  create table "public"."background_jobs" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null,
    "job_type" text not null,
    "payload" jsonb not null default '{}'::jsonb,
    "status" text not null default 'queued'::text,
    "run_at" timestamp with time zone not null default now(),
    "attempts" integer not null default 0,
    "max_attempts" integer not null default 5,
    "locked_at" timestamp with time zone,
    "locked_by" text,
    "last_error" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."background_jobs" enable row level security;


  create table "public"."bot_instructions" (
    "organization_id" uuid not null,
    "rules" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."bot_instructions" enable row level security;


  create table "public"."bot_personality" (
    "organization_id" uuid not null,
    "tone" text not null default 'Professional'::text,
    "language" text not null default 'English'::text,
    "short_responses" boolean default false,
    "emoji_usage" boolean default true,
    "gender_voice" text not null default 'Neutral'::text,
    "fallback_message" text not null default 'Let me connect you with an advisor.'::text,
    "business_context" text,
    "dos" text,
    "donts" text,
    "greeting_message" text,
    "id" uuid not null default gen_random_uuid()
      );


alter table "public"."bot_personality" enable row level security;


  create table "public"."campaign_delivery_import" (
    "phone" text,
    "campaign_name" text
      );


alter table "public"."campaign_delivery_import" enable row level security;


  create table "public"."campaign_delivery_receipt_failures" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null,
    "whatsapp_message_id" text,
    "status" text,
    "error_title" text,
    "received_at" timestamp with time zone not null default now(),
    "raw_status" jsonb not null default '{}'::jsonb,
    "raw_value" jsonb not null default '{}'::jsonb
      );


alter table "public"."campaign_delivery_receipt_failures" enable row level security;


  create table "public"."campaign_messages" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null,
    "campaign_id" uuid not null,
    "contact_id" uuid,
    "phone" text not null,
    "variables" jsonb,
    "status" public.campaign_message_status not null default 'pending'::public.campaign_message_status,
    "error" text,
    "whatsapp_message_id" text,
    "dispatched_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "replied_at" timestamp with time zone,
    "reply_whatsapp_message_id" text,
    "reply_text" text,
    "rendered_text" text,
    "raw_row" jsonb,
    "send_attempts" integer not null default 0,
    "next_retry_at" timestamp with time zone,
    "locked_at" timestamp with time zone,
    "locked_by" text,
    "last_attempt_at" timestamp with time zone
      );


alter table "public"."campaign_messages" enable row level security;


  create table "public"."campaigns" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null,
    "name" text not null,
    "description" text,
    "channel" text not null default 'whatsapp'::text,
    "status" public.campaign_status not null default 'draft'::public.campaign_status,
    "scheduled_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "template_body" text not null,
    "template_variables" text[],
    "total_recipients" integer not null default 0,
    "sent_count" integer not null default 0,
    "failed_count" integer not null default 0,
    "created_by" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "template_name" text,
    "whatsapp_template_id" uuid,
    "launched_at" timestamp with time zone,
    "variable_mapping" jsonb default '{}'::jsonb,
    "campaign_kind" text,
    "parent_campaign_id" uuid,
    "reply_sheet_tab" text,
    "meta" jsonb default '{}'::jsonb
      );


alter table "public"."campaigns" enable row level security;


  create table "public"."contact_uploads" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null,
    "file_name" text,
    "inserted_count" integer,
    "updated_count" integer,
    "skipped_count" integer,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."contact_uploads" enable row level security;


  create table "public"."contacts" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null,
    "phone" text not null,
    "name" text,
    "labels" jsonb default '{}'::jsonb,
    "created_at" timestamp with time zone default now(),
    "first_name" text,
    "last_name" text,
    "model" text,
    "metadata" jsonb not null default '{}'::jsonb
      );


alter table "public"."contacts" enable row level security;


  create table "public"."conversation_state" (
    "conversation_id" uuid not null,
    "workflow_id" uuid not null,
    "current_step" integer not null default 1,
    "variables" jsonb not null default '{}'::jsonb,
    "last_step_reason" text,
    "updated_at" timestamp with time zone default now(),
    "organization_id" uuid not null
      );


alter table "public"."conversation_state" enable row level security;


  create table "public"."conversations" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null,
    "contact_id" uuid,
    "assigned_to" uuid,
    "ai_enabled" boolean default true,
    "channel" text not null default 'web'::text,
    "last_message_at" timestamp with time zone,
    "created_at" timestamp with time zone default now(),
    "whatsapp_user_phone" text,
    "intent" text,
    "intent_source" text default 'ai'::text,
    "intent_update_count" integer not null default 0,
    "ai_summary" text,
    "ai_last_entities" jsonb,
    "ai_context_updated_at" timestamp with time zone,
    "ai_mode" text default 'auto'::text,
    "ai_locked" boolean not null default false,
    "ai_locked_by" uuid,
    "ai_locked_at" timestamp with time zone,
    "ai_lock_reason" text,
    "ai_locked_until" timestamp with time zone,
    "campaign_id" uuid,
    "workflow_id" uuid,
    "campaign_context" jsonb default '{}'::jsonb,
    "campaign_reply_sheet_tab" text
      );


alter table "public"."conversations" enable row level security;


  create table "public"."knowledge_articles" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null,
    "title" text not null,
    "description" text,
    "content" text not null,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "source_type" text not null default 'text'::text,
    "source_filename" text,
    "raw_content" text,
    "last_processed_at" timestamp with time zone,
    "processing_error" text,
    "file_bucket" text,
    "file_path" text,
    "mime_type" text,
    "original_filename" text,
    "keywords" text[] not null default '{}'::text[],
    "status" text default 'draft'::text,
    "published_at" timestamp with time zone,
    "updated_by" uuid,
    "processing_status" text
      );


alter table "public"."knowledge_articles" enable row level security;


  create table "public"."knowledge_chunks" (
    "id" uuid not null default gen_random_uuid(),
    "article_id" uuid not null,
    "chunk" text not null,
    "embedding" public.vector(1536) not null,
    "chunk_index" integer not null default 0,
    "organization_id" uuid not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."knowledge_chunks" enable row level security;


  create table "public"."message_delivery_dlq" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null,
    "source" text not null,
    "entity_type" text not null,
    "entity_id" uuid not null,
    "reason" text not null,
    "payload" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."message_delivery_dlq" enable row level security;


  create table "public"."message_delivery_events" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null,
    "message_id" uuid,
    "campaign_message_id" uuid,
    "event_type" text not null,
    "source" text not null,
    "event_at" timestamp with time zone not null default now(),
    "payload" jsonb not null default '{}'::jsonb
      );


alter table "public"."message_delivery_events" enable row level security;


  create table "public"."messages" (
    "id" uuid not null default gen_random_uuid(),
    "conversation_id" uuid,
    "sender" public.message_sender not null,
    "message_type" text not null default 'text'::text,
    "text" text,
    "media_url" text,
    "channel" text not null default 'web'::text,
    "created_at" timestamp with time zone default now(),
    "mime_type" text,
    "whatsapp_message_id" text,
    "wa_received_at" timestamp with time zone,
    "campaign_id" uuid,
    "campaign_message_id" uuid,
    "outbound_dedupe_key" text,
    "whatsapp_status" text,
    "sent_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "read_at" timestamp with time zone,
    "metadata" jsonb,
    "organization_id" uuid not null,
    "order_at" timestamp with time zone
      );


alter table "public"."messages" enable row level security;


  create table "public"."organization_users" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null,
    "user_id" uuid not null,
    "role" text default 'agent'::text,
    "created_at" timestamp with time zone default now(),
    "is_primary" boolean default true,
    "last_active_at" timestamp with time zone
      );


alter table "public"."organization_users" enable row level security;


  create table "public"."organizations" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "logo_url" text,
    "type" text,
    "created_at" timestamp with time zone default now(),
    "is_active" boolean not null default true,
    "status" text not null default 'active'::text,
    "google_sheet_id" text
      );


alter table "public"."organizations" enable row level security;


  create table "public"."psf_cases" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null,
    "campaign_id" uuid not null,
    "conversation_id" uuid,
    "phone" text not null,
    "uploaded_data" jsonb not null default '{}'::jsonb,
    "initial_sent_at" timestamp with time zone,
    "reminder_sent_at" timestamp with time zone,
    "last_customer_reply_at" timestamp with time zone,
    "sentiment" text,
    "ai_summary" text,
    "action_required" boolean not null default false,
    "resolution_status" text not null default 'open'::text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "customer_name" text,
    "resolved_at" timestamp with time zone,
    "resolved_by" uuid,
    "reminder_count" integer not null default 0,
    "last_reminder_at" timestamp with time zone,
    "first_customer_reply_at" timestamp with time zone,
    "model" text
      );


alter table "public"."psf_cases" enable row level security;


  create table "public"."razorpay_orders" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null,
    "wallet_id" uuid not null,
    "amount_paise" integer not null,
    "currency" text not null default 'INR'::text,
    "receipt" text not null,
    "status" text not null default 'created'::text,
    "razorpay_order_id" text not null,
    "notes" jsonb not null default '{}'::jsonb,
    "created_by" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."razorpay_orders" enable row level security;


  create table "public"."razorpay_payments" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null,
    "wallet_id" uuid not null,
    "razorpay_order_id" text not null,
    "razorpay_payment_id" text not null,
    "amount_paise" integer not null,
    "currency" text not null default 'INR'::text,
    "status" text not null,
    "raw_event" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."razorpay_payments" enable row level security;


  create table "public"."replay_requests" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null,
    "entity_type" text not null,
    "entity_id" uuid not null,
    "requested_by" uuid default auth.uid(),
    "requested_at" timestamp with time zone not null default now(),
    "status" text not null default 'queued'::text,
    "last_error" text,
    "result" jsonb not null default '{}'::jsonb
      );


alter table "public"."replay_requests" enable row level security;


  create table "public"."unanswered_questions" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid,
    "question" text not null,
    "occurrences" integer default 1,
    "created_at" timestamp with time zone default now(),
    "conversation_id" uuid,
    "channel" text,
    "status" text not null default 'open'::text,
    "ai_response" text,
    "last_seen_at" timestamp with time zone not null default now(),
    "resolved_at" timestamp with time zone,
    "resolution_article_id" uuid,
    "resolved_by" uuid,
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."unanswered_questions" enable row level security;


  create table "public"."wallet_alert_logs" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null,
    "wallet_id" uuid not null,
    "alert_type" text not null,
    "triggered_at" timestamp with time zone not null default now(),
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."wallet_alert_logs" enable row level security;


  create table "public"."wallet_transactions" (
    "id" uuid not null default gen_random_uuid(),
    "wallet_id" uuid not null,
    "type" text not null,
    "direction" text not null,
    "amount" numeric(12,4) not null,
    "reference_type" text,
    "reference_id" uuid,
    "metadata" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now(),
    "purpose" text not null default 'ai_chat'::text,
    "created_by" uuid,
    "created_by_role" text not null default 'system'::text,
    "balance_before" numeric(12,4),
    "balance_after" numeric(12,4),
    "organization_id" uuid not null
      );


alter table "public"."wallet_transactions" enable row level security;


  create table "public"."wallets" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null,
    "balance" numeric(12,4) not null default 0,
    "total_credited" numeric(12,4) not null default 0,
    "total_debited" numeric(12,4) not null default 0,
    "currency" text not null default 'INR'::text,
    "status" text not null default 'active'::text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "low_balance_threshold" numeric default 50,
    "critical_balance_threshold" numeric default 10
      );


alter table "public"."wallets" enable row level security;


  create table "public"."whatsapp_bulk_logs" (
    "id" uuid not null default gen_random_uuid(),
    "phone" text not null,
    "template" text not null,
    "status" text not null,
    "error" text,
    "created_at" timestamp with time zone default now(),
    "organization_id" uuid not null
      );


alter table "public"."whatsapp_bulk_logs" enable row level security;


  create table "public"."whatsapp_settings" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid,
    "phone_number" text,
    "api_token" text,
    "verify_token" text,
    "whatsapp_phone_id" text,
    "whatsapp_business_id" text,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."whatsapp_settings" enable row level security;


  create table "public"."whatsapp_templates" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null,
    "name" text not null,
    "category" text default 'MARKETING'::text,
    "language" text default 'en'::text,
    "header_type" text,
    "header_text" text,
    "body" text,
    "footer" text,
    "status" text not null default 'draft'::text,
    "meta_template_id" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "header_media_url" text,
    "header_media_mime" text,
    "header_variable_count" integer not null default 0,
    "header_variable_indices" integer[],
    "body_variable_count" integer not null default 0,
    "body_variable_indices" integer[]
      );


alter table "public"."whatsapp_templates" enable row level security;


  create table "public"."workflow_logs" (
    "id" uuid not null default gen_random_uuid(),
    "workflow_id" uuid,
    "conversation_id" uuid,
    "step_id" uuid,
    "data" jsonb,
    "created_at" timestamp with time zone default now(),
    "current_step_number" integer,
    "variables" jsonb default '{}'::jsonb,
    "completed" boolean not null default false,
    "organization_id" uuid not null
      );


alter table "public"."workflow_logs" enable row level security;


  create table "public"."workflow_steps" (
    "id" uuid not null default gen_random_uuid(),
    "workflow_id" uuid,
    "step_order" integer not null,
    "action" jsonb not null,
    "created_at" timestamp with time zone default now(),
    "instruction_text" text,
    "expected_user_input" text,
    "ai_action" text not null default 'give_information'::text,
    "metadata" jsonb default '{}'::jsonb,
    "organization_id" uuid not null
      );


alter table "public"."workflow_steps" enable row level security;


  create table "public"."workflows" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid,
    "name" text not null,
    "description" text,
    "trigger" jsonb,
    "created_at" timestamp with time zone default now(),
    "mode" text not null default 'strict'::text,
    "is_active" boolean not null default true,
    "trigger_type" text not null default 'keyword'::text
      );


alter table "public"."workflows" enable row level security;

CREATE UNIQUE INDEX ai_embeddings_cache_organization_id_model_text_hash_key ON public.ai_embeddings_cache USING btree (organization_id, model, text_hash);

CREATE UNIQUE INDEX ai_embeddings_cache_pkey ON public.ai_embeddings_cache USING btree (id);

CREATE UNIQUE INDEX ai_org_rate_limit_usage_pkey ON public.ai_org_rate_limit_usage USING btree (organization_id, window_start);

CREATE UNIQUE INDEX ai_org_rate_limits_pkey ON public.ai_org_rate_limits USING btree (organization_id);

CREATE UNIQUE INDEX ai_settings_pkey ON public.ai_settings USING btree (id);

CREATE INDEX ai_turn_traces_conv_started_at_idx ON public.ai_turn_traces USING btree (conversation_id, started_at DESC);

CREATE INDEX ai_turn_traces_org_started_at_idx ON public.ai_turn_traces USING btree (organization_id, started_at DESC);

CREATE UNIQUE INDEX ai_turn_traces_pkey ON public.ai_turn_traces USING btree (id);

CREATE UNIQUE INDEX ai_usage_logs_pkey ON public.ai_usage_logs USING btree (id);

CREATE INDEX audit_logs_created_at_idx ON public.audit_logs USING btree (created_at DESC);

CREATE INDEX audit_logs_entity_idx ON public.audit_logs USING btree (entity_type, entity_id);

CREATE INDEX audit_logs_org_idx ON public.audit_logs USING btree (organization_id);

CREATE UNIQUE INDEX audit_logs_pkey ON public.audit_logs USING btree (id);

CREATE INDEX background_jobs_org_status_run_at_idx ON public.background_jobs USING btree (organization_id, status, run_at);

CREATE UNIQUE INDEX background_jobs_pkey ON public.background_jobs USING btree (id);

CREATE INDEX background_jobs_status_run_at_idx ON public.background_jobs USING btree (status, run_at);

CREATE UNIQUE INDEX bot_personality_org_unique ON public.bot_personality USING btree (organization_id);

CREATE UNIQUE INDEX bot_personality_pkey ON public.bot_personality USING btree (id);

CREATE UNIQUE INDEX campaign_delivery_receipt_failures_pkey ON public.campaign_delivery_receipt_failures USING btree (id);

CREATE INDEX campaign_messages_claim_idx ON public.campaign_messages USING btree (campaign_id, status, next_retry_at, created_at);

CREATE UNIQUE INDEX campaign_messages_pkey ON public.campaign_messages USING btree (id);

CREATE UNIQUE INDEX campaigns_pkey ON public.campaigns USING btree (id);

CREATE INDEX cdrf_org_received_idx ON public.campaign_delivery_receipt_failures USING btree (organization_id, received_at DESC);

CREATE UNIQUE INDEX contact_uploads_pkey ON public.contact_uploads USING btree (id);

CREATE UNIQUE INDEX contacts_org_phone_uq ON public.contacts USING btree (organization_id, phone);

CREATE UNIQUE INDEX contacts_pkey ON public.contacts USING btree (id);

CREATE UNIQUE INDEX conversation_state_pkey ON public.conversation_state USING btree (conversation_id);

CREATE INDEX conversations_ai_locked_idx ON public.conversations USING btree (organization_id, ai_locked);

CREATE INDEX conversations_ai_locked_until_idx ON public.conversations USING btree (organization_id, ai_locked_until);

CREATE INDEX conversations_org_last_message_at_idx ON public.conversations USING btree (organization_id, last_message_at DESC);

CREATE UNIQUE INDEX conversations_pkey ON public.conversations USING btree (id);

CREATE UNIQUE INDEX conversations_unique_contact_channel ON public.conversations USING btree (organization_id, contact_id, channel);

CREATE UNIQUE INDEX conversations_whatsapp_unique ON public.conversations USING btree (organization_id, contact_id) WHERE (channel = 'whatsapp'::text);

CREATE INDEX idx_ai_settings_org ON public.ai_settings USING btree (organization_id);

CREATE INDEX idx_ai_usage_logs_created ON public.ai_usage_logs USING btree (created_at);

CREATE INDEX idx_ai_usage_logs_org ON public.ai_usage_logs USING btree (organization_id);

CREATE INDEX idx_campaign_messages_campaign ON public.campaign_messages USING btree (campaign_id);

CREATE INDEX idx_campaign_messages_campaign_status ON public.campaign_messages USING btree (campaign_id, status);

CREATE INDEX idx_campaign_messages_delivered_at ON public.campaign_messages USING btree (delivered_at);

CREATE INDEX idx_campaign_messages_dispatched_at ON public.campaign_messages USING btree (dispatched_at);

CREATE INDEX idx_campaign_messages_org_phone_status ON public.campaign_messages USING btree (organization_id, phone, status);

CREATE INDEX idx_campaign_messages_org_status ON public.campaign_messages USING btree (organization_id, status);

CREATE INDEX idx_campaign_messages_replied_at ON public.campaign_messages USING btree (replied_at);

CREATE INDEX idx_campaign_messages_reply ON public.campaign_messages USING btree (organization_id, replied_at);

CREATE INDEX idx_campaign_messages_send_queue ON public.campaign_messages USING btree (status, campaign_id, created_at);

CREATE INDEX idx_campaign_messages_whatsapp_message_id ON public.campaign_messages USING btree (whatsapp_message_id) WHERE (whatsapp_message_id IS NOT NULL);

CREATE INDEX idx_campaigns_org ON public.campaigns USING btree (organization_id);

CREATE INDEX idx_campaigns_org_status ON public.campaigns USING btree (organization_id, status);

CREATE INDEX idx_campaigns_org_template ON public.campaigns USING btree (organization_id, template_name);

CREATE INDEX idx_campaigns_scheduled_at ON public.campaigns USING btree (status, scheduled_at);

CREATE INDEX idx_campaigns_whatsapp_template_id ON public.campaigns USING btree (whatsapp_template_id);

CREATE INDEX idx_contacts_org_metadata ON public.contacts USING gin (metadata);

CREATE INDEX idx_contacts_org_model ON public.contacts USING btree (organization_id, model);

CREATE INDEX idx_contacts_org_name ON public.contacts USING btree (organization_id, name);

CREATE INDEX idx_contacts_org_phone ON public.contacts USING btree (organization_id, phone);

CREATE INDEX idx_conversations_ai_context ON public.conversations USING btree (ai_context_updated_at);

CREATE INDEX idx_conversations_campaign_id ON public.conversations USING btree (campaign_id);

CREATE INDEX idx_conversations_intent ON public.conversations USING btree (intent);

CREATE INDEX idx_conversations_org_assigned ON public.conversations USING btree (organization_id, assigned_to);

CREATE INDEX idx_conversations_org_channel_last ON public.conversations USING btree (organization_id, channel, last_message_at);

CREATE INDEX idx_conversations_org_intent ON public.conversations USING btree (organization_id, intent);

CREATE INDEX idx_conversations_org_last_message_at ON public.conversations USING btree (organization_id, last_message_at DESC);

CREATE INDEX idx_conversations_workflow_id ON public.conversations USING btree (workflow_id);

CREATE INDEX idx_kb_chunks_embedding ON public.knowledge_chunks USING ivfflat (embedding public.vector_cosine_ops) WITH (lists='100');

CREATE INDEX idx_kb_chunks_org_article ON public.knowledge_chunks USING btree (organization_id, article_id);

CREATE INDEX idx_kb_keywords_gin ON public.knowledge_articles USING gin (keywords);

CREATE INDEX idx_knowledge_articles_org_updated ON public.knowledge_articles USING btree (organization_id, updated_at DESC);

CREATE INDEX idx_knowledge_articles_status ON public.knowledge_articles USING btree (status);

CREATE INDEX idx_knowledge_chunks_article_chunk ON public.knowledge_chunks USING btree (article_id, chunk_index);

CREATE INDEX idx_knowledge_chunks_org ON public.knowledge_chunks USING btree (organization_id);

CREATE INDEX idx_messages_campaign_message_id ON public.messages USING btree (campaign_message_id) WHERE (campaign_message_id IS NOT NULL);

CREATE INDEX idx_messages_conversation_created ON public.messages USING btree (conversation_id, created_at);

CREATE INDEX idx_messages_org_conversation_created ON public.messages USING btree (organization_id, conversation_id, created_at);

CREATE INDEX idx_messages_whatsapp_receipts ON public.messages USING btree (whatsapp_status) WHERE (whatsapp_status IS NOT NULL);

CREATE INDEX idx_org_users_user_last_active ON public.organization_users USING btree (user_id, last_active_at DESC);

CREATE INDEX idx_psf_cases_action_required ON public.psf_cases USING btree (action_required) WHERE (action_required = true);

CREATE INDEX idx_psf_cases_campaign_phone ON public.psf_cases USING btree (campaign_id, phone);

CREATE INDEX idx_psf_cases_conversation ON public.psf_cases USING btree (conversation_id);

CREATE INDEX idx_psf_cases_org ON public.psf_cases USING btree (organization_id);

CREATE INDEX idx_psf_cases_org_created ON public.psf_cases USING btree (organization_id, created_at DESC);

CREATE INDEX idx_psf_cases_resolution ON public.psf_cases USING btree (resolution_status);

CREATE INDEX idx_psf_cases_sentiment ON public.psf_cases USING btree (sentiment);

CREATE INDEX idx_razorpay_orders_created ON public.razorpay_orders USING btree (created_at);

CREATE INDEX idx_razorpay_orders_org ON public.razorpay_orders USING btree (organization_id);

CREATE INDEX idx_razorpay_orders_wallet ON public.razorpay_orders USING btree (wallet_id);

CREATE INDEX idx_razorpay_payments_order ON public.razorpay_payments USING btree (razorpay_order_id);

CREATE INDEX idx_razorpay_payments_org ON public.razorpay_payments USING btree (organization_id);

CREATE INDEX idx_razorpay_payments_wallet ON public.razorpay_payments USING btree (wallet_id);

CREATE INDEX idx_unanswered_last_seen ON public.unanswered_questions USING btree (last_seen_at DESC);

CREATE INDEX idx_unanswered_org_status ON public.unanswered_questions USING btree (organization_id, status);

CREATE INDEX idx_wallet_alerts_org ON public.wallet_alert_logs USING btree (organization_id);

CREATE INDEX idx_wallet_alerts_wallet ON public.wallet_alert_logs USING btree (wallet_id);

CREATE INDEX idx_wallet_transactions_created ON public.wallet_transactions USING btree (created_at);

CREATE INDEX idx_wallet_transactions_created_by ON public.wallet_transactions USING btree (created_by);

CREATE INDEX idx_wallet_transactions_purpose ON public.wallet_transactions USING btree (purpose);

CREATE INDEX idx_wallet_transactions_reference ON public.wallet_transactions USING btree (reference_type, reference_id);

CREATE INDEX idx_wallet_transactions_wallet ON public.wallet_transactions USING btree (wallet_id);

CREATE INDEX idx_wallets_org ON public.wallets USING btree (organization_id);

CREATE INDEX idx_whatsapp_templates_org ON public.whatsapp_templates USING btree (organization_id);

CREATE INDEX idx_workflow_logs_conversation_active ON public.workflow_logs USING btree (conversation_id, completed);

CREATE INDEX idx_workflow_logs_org_conversation_created ON public.workflow_logs USING btree (organization_id, conversation_id, created_at);

CREATE INDEX idx_workflow_logs_workflow ON public.workflow_logs USING btree (workflow_id);

CREATE INDEX knowledge_articles_org_status_idx ON public.knowledge_articles USING btree (organization_id, status);

CREATE INDEX knowledge_articles_org_updated_at_idx ON public.knowledge_articles USING btree (organization_id, updated_at DESC);

CREATE UNIQUE INDEX knowledge_articles_pkey ON public.knowledge_articles USING btree (id);

CREATE INDEX knowledge_chunks_embedding_hnsw ON public.knowledge_chunks USING hnsw (embedding public.vector_cosine_ops);

CREATE UNIQUE INDEX knowledge_chunks_pkey ON public.knowledge_chunks USING btree (id);

CREATE INDEX message_delivery_dlq_org_created_at_idx ON public.message_delivery_dlq USING btree (organization_id, created_at DESC);

CREATE UNIQUE INDEX message_delivery_dlq_pkey ON public.message_delivery_dlq USING btree (id);

CREATE INDEX message_delivery_events_campaign_message_idx ON public.message_delivery_events USING btree (campaign_message_id, event_at DESC);

CREATE INDEX message_delivery_events_message_idx ON public.message_delivery_events USING btree (message_id, event_at DESC);

CREATE INDEX message_delivery_events_org_event_at_idx ON public.message_delivery_events USING btree (organization_id, event_at DESC);

CREATE UNIQUE INDEX message_delivery_events_pkey ON public.message_delivery_events USING btree (id);

CREATE INDEX messages_conversation_order_at_idx ON public.messages USING btree (conversation_id, order_at);

CREATE INDEX messages_org_conversation_order_at_idx ON public.messages USING btree (organization_id, conversation_id, order_at DESC);

CREATE INDEX messages_org_created_at_idx ON public.messages USING btree (organization_id, created_at DESC);

CREATE UNIQUE INDEX messages_org_outbound_dedupe_key_uniq ON public.messages USING btree (organization_id, outbound_dedupe_key) WHERE (outbound_dedupe_key IS NOT NULL);

CREATE UNIQUE INDEX messages_pkey ON public.messages USING btree (id);

CREATE UNIQUE INDEX organization_users_pkey ON public.organization_users USING btree (id);

CREATE UNIQUE INDEX organizations_pkey ON public.organizations USING btree (id);

CREATE UNIQUE INDEX psf_cases_campaign_id_phone_key ON public.psf_cases USING btree (campaign_id, phone);

CREATE UNIQUE INDEX psf_cases_pkey ON public.psf_cases USING btree (id);

CREATE UNIQUE INDEX razorpay_orders_pkey ON public.razorpay_orders USING btree (id);

CREATE UNIQUE INDEX razorpay_orders_razorpay_order_id_key ON public.razorpay_orders USING btree (razorpay_order_id);

CREATE UNIQUE INDEX razorpay_payments_pkey ON public.razorpay_payments USING btree (id);

CREATE UNIQUE INDEX razorpay_payments_razorpay_payment_id_key ON public.razorpay_payments USING btree (razorpay_payment_id);

CREATE INDEX replay_requests_org_requested_at_idx ON public.replay_requests USING btree (organization_id, requested_at DESC);

CREATE UNIQUE INDEX replay_requests_pkey ON public.replay_requests USING btree (id);

CREATE UNIQUE INDEX unanswered_questions_pkey ON public.unanswered_questions USING btree (id);

CREATE UNIQUE INDEX uniq_contacts_org_phone ON public.contacts USING btree (organization_id, phone);

CREATE UNIQUE INDEX uniq_messages_outbound_dedupe_key ON public.messages USING btree (conversation_id, outbound_dedupe_key) WHERE (outbound_dedupe_key IS NOT NULL);

CREATE UNIQUE INDEX uniq_messages_whatsapp_message_id ON public.messages USING btree (whatsapp_message_id) WHERE (whatsapp_message_id IS NOT NULL);

CREATE UNIQUE INDEX uq_ai_usage_logs_wallet_transaction_id ON public.ai_usage_logs USING btree (wallet_transaction_id) WHERE (wallet_transaction_id IS NOT NULL);

CREATE UNIQUE INDEX uq_wallet_active_alert ON public.wallet_alert_logs USING btree (wallet_id, alert_type) WHERE (resolved_at IS NULL);

CREATE UNIQUE INDEX wallet_alert_logs_pkey ON public.wallet_alert_logs USING btree (id);

CREATE UNIQUE INDEX wallet_transactions_pkey ON public.wallet_transactions USING btree (id);

CREATE UNIQUE INDEX wallets_organization_id_key ON public.wallets USING btree (organization_id);

CREATE UNIQUE INDEX wallets_pkey ON public.wallets USING btree (id);

CREATE UNIQUE INDEX whatsapp_bulk_logs_pkey ON public.whatsapp_bulk_logs USING btree (id);

CREATE UNIQUE INDEX whatsapp_settings_organization_unique ON public.whatsapp_settings USING btree (organization_id);

CREATE UNIQUE INDEX whatsapp_settings_pkey ON public.whatsapp_settings USING btree (id);

CREATE UNIQUE INDEX whatsapp_templates_org_name_lang ON public.whatsapp_templates USING btree (organization_id, name, language);

CREATE UNIQUE INDEX whatsapp_templates_pkey ON public.whatsapp_templates USING btree (id);

CREATE UNIQUE INDEX workflow_logs_active_unique ON public.workflow_logs USING btree (organization_id, conversation_id, workflow_id) WHERE (completed = false);

CREATE UNIQUE INDEX workflow_logs_pkey ON public.workflow_logs USING btree (id);

CREATE UNIQUE INDEX workflow_steps_pkey ON public.workflow_steps USING btree (id);

CREATE UNIQUE INDEX workflows_pkey ON public.workflows USING btree (id);

alter table "public"."ai_embeddings_cache" add constraint "ai_embeddings_cache_pkey" PRIMARY KEY using index "ai_embeddings_cache_pkey";

alter table "public"."ai_org_rate_limit_usage" add constraint "ai_org_rate_limit_usage_pkey" PRIMARY KEY using index "ai_org_rate_limit_usage_pkey";

alter table "public"."ai_org_rate_limits" add constraint "ai_org_rate_limits_pkey" PRIMARY KEY using index "ai_org_rate_limits_pkey";

alter table "public"."ai_settings" add constraint "ai_settings_pkey" PRIMARY KEY using index "ai_settings_pkey";

alter table "public"."ai_turn_traces" add constraint "ai_turn_traces_pkey" PRIMARY KEY using index "ai_turn_traces_pkey";

alter table "public"."ai_usage_logs" add constraint "ai_usage_logs_pkey" PRIMARY KEY using index "ai_usage_logs_pkey";

alter table "public"."audit_logs" add constraint "audit_logs_pkey" PRIMARY KEY using index "audit_logs_pkey";

alter table "public"."background_jobs" add constraint "background_jobs_pkey" PRIMARY KEY using index "background_jobs_pkey";

alter table "public"."bot_personality" add constraint "bot_personality_pkey" PRIMARY KEY using index "bot_personality_pkey";

alter table "public"."campaign_delivery_receipt_failures" add constraint "campaign_delivery_receipt_failures_pkey" PRIMARY KEY using index "campaign_delivery_receipt_failures_pkey";

alter table "public"."campaign_messages" add constraint "campaign_messages_pkey" PRIMARY KEY using index "campaign_messages_pkey";

alter table "public"."campaigns" add constraint "campaigns_pkey" PRIMARY KEY using index "campaigns_pkey";

alter table "public"."contact_uploads" add constraint "contact_uploads_pkey" PRIMARY KEY using index "contact_uploads_pkey";

alter table "public"."contacts" add constraint "contacts_pkey" PRIMARY KEY using index "contacts_pkey";

alter table "public"."conversation_state" add constraint "conversation_state_pkey" PRIMARY KEY using index "conversation_state_pkey";

alter table "public"."conversations" add constraint "conversations_pkey" PRIMARY KEY using index "conversations_pkey";

alter table "public"."knowledge_articles" add constraint "knowledge_articles_pkey" PRIMARY KEY using index "knowledge_articles_pkey";

alter table "public"."knowledge_chunks" add constraint "knowledge_chunks_pkey" PRIMARY KEY using index "knowledge_chunks_pkey";

alter table "public"."message_delivery_dlq" add constraint "message_delivery_dlq_pkey" PRIMARY KEY using index "message_delivery_dlq_pkey";

alter table "public"."message_delivery_events" add constraint "message_delivery_events_pkey" PRIMARY KEY using index "message_delivery_events_pkey";

alter table "public"."messages" add constraint "messages_pkey" PRIMARY KEY using index "messages_pkey";

alter table "public"."organization_users" add constraint "organization_users_pkey" PRIMARY KEY using index "organization_users_pkey";

alter table "public"."organizations" add constraint "organizations_pkey" PRIMARY KEY using index "organizations_pkey";

alter table "public"."psf_cases" add constraint "psf_cases_pkey" PRIMARY KEY using index "psf_cases_pkey";

alter table "public"."razorpay_orders" add constraint "razorpay_orders_pkey" PRIMARY KEY using index "razorpay_orders_pkey";

alter table "public"."razorpay_payments" add constraint "razorpay_payments_pkey" PRIMARY KEY using index "razorpay_payments_pkey";

alter table "public"."replay_requests" add constraint "replay_requests_pkey" PRIMARY KEY using index "replay_requests_pkey";

alter table "public"."unanswered_questions" add constraint "unanswered_questions_pkey" PRIMARY KEY using index "unanswered_questions_pkey";

alter table "public"."wallet_alert_logs" add constraint "wallet_alert_logs_pkey" PRIMARY KEY using index "wallet_alert_logs_pkey";

alter table "public"."wallet_transactions" add constraint "wallet_transactions_pkey" PRIMARY KEY using index "wallet_transactions_pkey";

alter table "public"."wallets" add constraint "wallets_pkey" PRIMARY KEY using index "wallets_pkey";

alter table "public"."whatsapp_bulk_logs" add constraint "whatsapp_bulk_logs_pkey" PRIMARY KEY using index "whatsapp_bulk_logs_pkey";

alter table "public"."whatsapp_settings" add constraint "whatsapp_settings_pkey" PRIMARY KEY using index "whatsapp_settings_pkey";

alter table "public"."whatsapp_templates" add constraint "whatsapp_templates_pkey" PRIMARY KEY using index "whatsapp_templates_pkey";

alter table "public"."workflow_logs" add constraint "workflow_logs_pkey" PRIMARY KEY using index "workflow_logs_pkey";

alter table "public"."workflow_steps" add constraint "workflow_steps_pkey" PRIMARY KEY using index "workflow_steps_pkey";

alter table "public"."workflows" add constraint "workflows_pkey" PRIMARY KEY using index "workflows_pkey";

alter table "public"."ai_embeddings_cache" add constraint "ai_embeddings_cache_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE not valid;

alter table "public"."ai_embeddings_cache" validate constraint "ai_embeddings_cache_organization_id_fkey";

alter table "public"."ai_embeddings_cache" add constraint "ai_embeddings_cache_organization_id_model_text_hash_key" UNIQUE using index "ai_embeddings_cache_organization_id_model_text_hash_key";

alter table "public"."ai_org_rate_limit_usage" add constraint "ai_org_rate_limit_usage_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE not valid;

alter table "public"."ai_org_rate_limit_usage" validate constraint "ai_org_rate_limit_usage_organization_id_fkey";

alter table "public"."ai_org_rate_limits" add constraint "ai_org_rate_limits_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE not valid;

alter table "public"."ai_org_rate_limits" validate constraint "ai_org_rate_limits_organization_id_fkey";

alter table "public"."ai_settings" add constraint "ai_settings_kb_search_type_check" CHECK ((kb_search_type = ANY (ARRAY['default'::text, 'hybrid'::text, 'title'::text]))) not valid;

alter table "public"."ai_settings" validate constraint "ai_settings_kb_search_type_check";

alter table "public"."ai_settings" add constraint "ai_settings_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE not valid;

alter table "public"."ai_settings" validate constraint "ai_settings_organization_id_fkey";

alter table "public"."ai_settings" add constraint "ai_settings_provider_check" CHECK ((provider = ANY (ARRAY['openai'::text, 'gemini'::text]))) not valid;

alter table "public"."ai_settings" validate constraint "ai_settings_provider_check";

alter table "public"."ai_turn_traces" add constraint "ai_turn_traces_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL not valid;

alter table "public"."ai_turn_traces" validate constraint "ai_turn_traces_conversation_id_fkey";

alter table "public"."ai_turn_traces" add constraint "ai_turn_traces_input_message_id_fkey" FOREIGN KEY (input_message_id) REFERENCES public.messages(id) ON DELETE SET NULL not valid;

alter table "public"."ai_turn_traces" validate constraint "ai_turn_traces_input_message_id_fkey";

alter table "public"."ai_turn_traces" add constraint "ai_turn_traces_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE not valid;

alter table "public"."ai_turn_traces" validate constraint "ai_turn_traces_organization_id_fkey";

alter table "public"."ai_turn_traces" add constraint "ai_turn_traces_output_message_id_fkey" FOREIGN KEY (output_message_id) REFERENCES public.messages(id) ON DELETE SET NULL not valid;

alter table "public"."ai_turn_traces" validate constraint "ai_turn_traces_output_message_id_fkey";

alter table "public"."ai_turn_traces" add constraint "ai_turn_traces_workflow_id_fkey" FOREIGN KEY (workflow_id) REFERENCES public.workflows(id) ON DELETE SET NULL not valid;

alter table "public"."ai_turn_traces" validate constraint "ai_turn_traces_workflow_id_fkey";

alter table "public"."ai_usage_logs" add constraint "ai_usage_logs_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL not valid;

alter table "public"."ai_usage_logs" validate constraint "ai_usage_logs_conversation_id_fkey";

alter table "public"."ai_usage_logs" add constraint "ai_usage_logs_message_id_fkey" FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE SET NULL not valid;

alter table "public"."ai_usage_logs" validate constraint "ai_usage_logs_message_id_fkey";

alter table "public"."ai_usage_logs" add constraint "ai_usage_logs_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE not valid;

alter table "public"."ai_usage_logs" validate constraint "ai_usage_logs_organization_id_fkey";

alter table "public"."ai_usage_logs" add constraint "ai_usage_logs_wallet_transaction_id_fkey" FOREIGN KEY (wallet_transaction_id) REFERENCES public.wallet_transactions(id) ON DELETE SET NULL not valid;

alter table "public"."ai_usage_logs" validate constraint "ai_usage_logs_wallet_transaction_id_fkey";

alter table "public"."background_jobs" add constraint "background_jobs_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE not valid;

alter table "public"."background_jobs" validate constraint "background_jobs_organization_id_fkey";

alter table "public"."bot_instructions" add constraint "bot_instructions_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE not valid;

alter table "public"."bot_instructions" validate constraint "bot_instructions_organization_id_fkey";

alter table "public"."bot_personality" add constraint "bot_personality_org_unique" UNIQUE using index "bot_personality_org_unique";

alter table "public"."bot_personality" add constraint "bot_personality_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE not valid;

alter table "public"."bot_personality" validate constraint "bot_personality_organization_id_fkey";

alter table "public"."campaign_messages" add constraint "campaign_messages_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE not valid;

alter table "public"."campaign_messages" validate constraint "campaign_messages_campaign_id_fkey";

alter table "public"."campaign_messages" add constraint "campaign_messages_contact_id_fkey" FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL not valid;

alter table "public"."campaign_messages" validate constraint "campaign_messages_contact_id_fkey";

alter table "public"."campaign_messages" add constraint "campaign_messages_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE not valid;

alter table "public"."campaign_messages" validate constraint "campaign_messages_organization_id_fkey";

alter table "public"."campaign_messages" add constraint "campaign_messages_send_attempts_nonnegative" CHECK ((send_attempts >= 0)) not valid;

alter table "public"."campaign_messages" validate constraint "campaign_messages_send_attempts_nonnegative";

alter table "public"."campaigns" add constraint "campaigns_campaign_kind_check" CHECK ((campaign_kind = ANY (ARRAY['general'::text, 'psf_initial'::text, 'psf_reminder'::text]))) not valid;

alter table "public"."campaigns" validate constraint "campaigns_campaign_kind_check";

alter table "public"."campaigns" add constraint "campaigns_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE not valid;

alter table "public"."campaigns" validate constraint "campaigns_organization_id_fkey";

alter table "public"."campaigns" add constraint "campaigns_parent_campaign_id_fkey" FOREIGN KEY (parent_campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL not valid;

alter table "public"."campaigns" validate constraint "campaigns_parent_campaign_id_fkey";

alter table "public"."campaigns" add constraint "campaigns_whatsapp_template_id_fkey" FOREIGN KEY (whatsapp_template_id) REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL not valid;

alter table "public"."campaigns" validate constraint "campaigns_whatsapp_template_id_fkey";

alter table "public"."contacts" add constraint "contacts_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE not valid;

alter table "public"."contacts" validate constraint "contacts_organization_id_fkey";

alter table "public"."conversations" add constraint "conversations_ai_mode_check" CHECK ((ai_mode = ANY (ARRAY['auto'::text, 'suggest'::text, 'off'::text]))) not valid;

alter table "public"."conversations" validate constraint "conversations_ai_mode_check";

alter table "public"."conversations" add constraint "conversations_channel_check" CHECK ((channel = ANY (ARRAY['web'::text, 'whatsapp'::text, 'internal'::text]))) not valid;

alter table "public"."conversations" validate constraint "conversations_channel_check";

alter table "public"."conversations" add constraint "conversations_contact_id_fkey" FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE not valid;

alter table "public"."conversations" validate constraint "conversations_contact_id_fkey";

alter table "public"."conversations" add constraint "conversations_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE not valid;

alter table "public"."conversations" validate constraint "conversations_organization_id_fkey";

alter table "public"."knowledge_articles" add constraint "knowledge_articles_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE not valid;

alter table "public"."knowledge_articles" validate constraint "knowledge_articles_organization_id_fkey";

alter table "public"."knowledge_articles" add constraint "knowledge_articles_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text]))) not valid;

alter table "public"."knowledge_articles" validate constraint "knowledge_articles_status_check";

alter table "public"."knowledge_chunks" add constraint "knowledge_chunks_article_id_fkey" FOREIGN KEY (article_id) REFERENCES public.knowledge_articles(id) ON DELETE CASCADE not valid;

alter table "public"."knowledge_chunks" validate constraint "knowledge_chunks_article_id_fkey";

alter table "public"."knowledge_chunks" add constraint "knowledge_chunks_org_fk" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE not valid;

alter table "public"."knowledge_chunks" validate constraint "knowledge_chunks_org_fk";

alter table "public"."message_delivery_dlq" add constraint "message_delivery_dlq_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE not valid;

alter table "public"."message_delivery_dlq" validate constraint "message_delivery_dlq_organization_id_fkey";

alter table "public"."message_delivery_events" add constraint "message_delivery_events_campaign_message_id_fkey" FOREIGN KEY (campaign_message_id) REFERENCES public.campaign_messages(id) ON DELETE SET NULL not valid;

alter table "public"."message_delivery_events" validate constraint "message_delivery_events_campaign_message_id_fkey";

alter table "public"."message_delivery_events" add constraint "message_delivery_events_message_id_fkey" FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE not valid;

alter table "public"."message_delivery_events" validate constraint "message_delivery_events_message_id_fkey";

alter table "public"."message_delivery_events" add constraint "message_delivery_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE not valid;

alter table "public"."message_delivery_events" validate constraint "message_delivery_events_organization_id_fkey";

alter table "public"."messages" add constraint "messages_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL not valid;

alter table "public"."messages" validate constraint "messages_campaign_id_fkey";

alter table "public"."messages" add constraint "messages_channel_check" CHECK ((channel = ANY (ARRAY['web'::text, 'whatsapp'::text, 'internal'::text]))) not valid;

alter table "public"."messages" validate constraint "messages_channel_check";

alter table "public"."messages" add constraint "messages_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE not valid;

alter table "public"."messages" validate constraint "messages_conversation_id_fkey";

alter table "public"."messages" add constraint "messages_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE not valid;

alter table "public"."messages" validate constraint "messages_organization_id_fkey";

alter table "public"."organization_users" add constraint "organization_users_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE not valid;

alter table "public"."organization_users" validate constraint "organization_users_organization_id_fkey";

alter table "public"."organization_users" add constraint "organization_users_role_check" CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'agent'::text]))) not valid;

alter table "public"."organization_users" validate constraint "organization_users_role_check";

alter table "public"."organizations" add constraint "organizations_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'suspended'::text]))) not valid;

alter table "public"."organizations" validate constraint "organizations_status_check";

alter table "public"."psf_cases" add constraint "psf_cases_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE not valid;

alter table "public"."psf_cases" validate constraint "psf_cases_campaign_id_fkey";

alter table "public"."psf_cases" add constraint "psf_cases_campaign_id_phone_key" UNIQUE using index "psf_cases_campaign_id_phone_key";

alter table "public"."psf_cases" add constraint "psf_cases_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL not valid;

alter table "public"."psf_cases" validate constraint "psf_cases_conversation_id_fkey";

alter table "public"."psf_cases" add constraint "psf_cases_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE not valid;

alter table "public"."psf_cases" validate constraint "psf_cases_organization_id_fkey";

alter table "public"."psf_cases" add constraint "psf_cases_resolution_status_check" CHECK ((resolution_status = ANY (ARRAY['open'::text, 'resolved'::text]))) not valid;

alter table "public"."psf_cases" validate constraint "psf_cases_resolution_status_check";

alter table "public"."psf_cases" add constraint "psf_cases_sentiment_check" CHECK ((sentiment = ANY (ARRAY['positive'::text, 'negative'::text, 'neutral'::text]))) not valid;

alter table "public"."psf_cases" validate constraint "psf_cases_sentiment_check";

alter table "public"."razorpay_orders" add constraint "razorpay_orders_amount_paise_check" CHECK ((amount_paise > 0)) not valid;

alter table "public"."razorpay_orders" validate constraint "razorpay_orders_amount_paise_check";

alter table "public"."razorpay_orders" add constraint "razorpay_orders_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE not valid;

alter table "public"."razorpay_orders" validate constraint "razorpay_orders_organization_id_fkey";

alter table "public"."razorpay_orders" add constraint "razorpay_orders_razorpay_order_id_key" UNIQUE using index "razorpay_orders_razorpay_order_id_key";

alter table "public"."razorpay_orders" add constraint "razorpay_orders_wallet_id_fkey" FOREIGN KEY (wallet_id) REFERENCES public.wallets(id) ON DELETE CASCADE not valid;

alter table "public"."razorpay_orders" validate constraint "razorpay_orders_wallet_id_fkey";

alter table "public"."razorpay_payments" add constraint "razorpay_payments_amount_paise_check" CHECK ((amount_paise > 0)) not valid;

alter table "public"."razorpay_payments" validate constraint "razorpay_payments_amount_paise_check";

alter table "public"."razorpay_payments" add constraint "razorpay_payments_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE not valid;

alter table "public"."razorpay_payments" validate constraint "razorpay_payments_organization_id_fkey";

alter table "public"."razorpay_payments" add constraint "razorpay_payments_razorpay_payment_id_key" UNIQUE using index "razorpay_payments_razorpay_payment_id_key";

alter table "public"."razorpay_payments" add constraint "razorpay_payments_wallet_id_fkey" FOREIGN KEY (wallet_id) REFERENCES public.wallets(id) ON DELETE CASCADE not valid;

alter table "public"."razorpay_payments" validate constraint "razorpay_payments_wallet_id_fkey";

alter table "public"."replay_requests" add constraint "replay_requests_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE not valid;

alter table "public"."replay_requests" validate constraint "replay_requests_organization_id_fkey";

alter table "public"."unanswered_questions" add constraint "unanswered_questions_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE not valid;

alter table "public"."unanswered_questions" validate constraint "unanswered_questions_organization_id_fkey";

alter table "public"."unanswered_questions" add constraint "unanswered_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'answered'::text, 'ignored'::text]))) not valid;

alter table "public"."unanswered_questions" validate constraint "unanswered_status_check";

alter table "public"."wallet_alert_logs" add constraint "wallet_alert_logs_alert_type_check" CHECK ((alert_type = ANY (ARRAY['low'::text, 'critical'::text, 'inactive'::text]))) not valid;

alter table "public"."wallet_alert_logs" validate constraint "wallet_alert_logs_alert_type_check";

alter table "public"."wallet_alert_logs" add constraint "wallet_alert_logs_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE not valid;

alter table "public"."wallet_alert_logs" validate constraint "wallet_alert_logs_organization_id_fkey";

alter table "public"."wallet_alert_logs" add constraint "wallet_alert_logs_wallet_id_fkey" FOREIGN KEY (wallet_id) REFERENCES public.wallets(id) ON DELETE CASCADE not valid;

alter table "public"."wallet_alert_logs" validate constraint "wallet_alert_logs_wallet_id_fkey";

alter table "public"."wallet_transactions" add constraint "wallet_transactions_amount_check" CHECK ((amount > (0)::numeric)) not valid;

alter table "public"."wallet_transactions" validate constraint "wallet_transactions_amount_check";

alter table "public"."wallet_transactions" add constraint "wallet_transactions_direction_check" CHECK ((direction = ANY (ARRAY['in'::text, 'out'::text]))) not valid;

alter table "public"."wallet_transactions" validate constraint "wallet_transactions_direction_check";

alter table "public"."wallet_transactions" add constraint "wallet_transactions_type_check" CHECK ((type = ANY (ARRAY['credit'::text, 'debit'::text, 'adjustment'::text]))) not valid;

alter table "public"."wallet_transactions" validate constraint "wallet_transactions_type_check";

alter table "public"."wallet_transactions" add constraint "wallet_transactions_wallet_id_fkey" FOREIGN KEY (wallet_id) REFERENCES public.wallets(id) ON DELETE CASCADE not valid;

alter table "public"."wallet_transactions" validate constraint "wallet_transactions_wallet_id_fkey";

alter table "public"."wallet_transactions" add constraint "wallet_txn_balance_snapshots_present" CHECK (((balance_before IS NOT NULL) AND (balance_after IS NOT NULL))) NOT VALID not valid;

alter table "public"."wallet_transactions" validate constraint "wallet_txn_balance_snapshots_present";

alter table "public"."wallet_transactions" add constraint "wallet_txn_debit_requires_reference" CHECK (((type <> 'debit'::text) OR ((reference_type = ANY (ARRAY['ai_usage'::text, 'campaign'::text, 'voice'::text])) AND (reference_id IS NOT NULL)))) not valid;

alter table "public"."wallet_transactions" validate constraint "wallet_txn_debit_requires_reference";

alter table "public"."wallet_transactions" add constraint "wallet_txn_type_direction_check" CHECK ((((type = 'credit'::text) AND (direction = 'in'::text)) OR ((type = 'debit'::text) AND (direction = 'out'::text)) OR ((type = 'adjustment'::text) AND (direction = ANY (ARRAY['in'::text, 'out'::text]))))) not valid;

alter table "public"."wallet_transactions" validate constraint "wallet_txn_type_direction_check";

alter table "public"."wallets" add constraint "wallet_threshold_sanity_check" CHECK ((critical_balance_threshold <= low_balance_threshold)) not valid;

alter table "public"."wallets" validate constraint "wallet_threshold_sanity_check";

alter table "public"."wallets" add constraint "wallets_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE not valid;

alter table "public"."wallets" validate constraint "wallets_organization_id_fkey";

alter table "public"."wallets" add constraint "wallets_organization_id_key" UNIQUE using index "wallets_organization_id_key";

alter table "public"."wallets" add constraint "wallets_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text]))) not valid;

alter table "public"."wallets" validate constraint "wallets_status_check";

alter table "public"."whatsapp_bulk_logs" add constraint "whatsapp_bulk_logs_org_fk" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) not valid;

alter table "public"."whatsapp_bulk_logs" validate constraint "whatsapp_bulk_logs_org_fk";

alter table "public"."whatsapp_settings" add constraint "whatsapp_settings_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE not valid;

alter table "public"."whatsapp_settings" validate constraint "whatsapp_settings_organization_id_fkey";

alter table "public"."whatsapp_settings" add constraint "whatsapp_settings_organization_unique" UNIQUE using index "whatsapp_settings_organization_unique";

alter table "public"."whatsapp_templates" add constraint "whatsapp_templates_body_var_check" CHECK ((((body_variable_count = 0) AND (body_variable_indices IS NULL)) OR ((body_variable_count > 0) AND (cardinality(body_variable_indices) = body_variable_count)))) not valid;

alter table "public"."whatsapp_templates" validate constraint "whatsapp_templates_body_var_check";

alter table "public"."whatsapp_templates" add constraint "whatsapp_templates_header_var_check" CHECK ((((header_variable_count = 0) AND (header_variable_indices IS NULL)) OR ((header_variable_count > 0) AND (cardinality(header_variable_indices) = header_variable_count)))) not valid;

alter table "public"."whatsapp_templates" validate constraint "whatsapp_templates_header_var_check";

alter table "public"."whatsapp_templates" add constraint "whatsapp_templates_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE not valid;

alter table "public"."whatsapp_templates" validate constraint "whatsapp_templates_organization_id_fkey";

alter table "public"."workflow_logs" add constraint "workflow_logs_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL not valid;

alter table "public"."workflow_logs" validate constraint "workflow_logs_conversation_id_fkey";

alter table "public"."workflow_logs" add constraint "workflow_logs_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE not valid;

alter table "public"."workflow_logs" validate constraint "workflow_logs_organization_id_fkey";

alter table "public"."workflow_logs" add constraint "workflow_logs_step_id_fkey" FOREIGN KEY (step_id) REFERENCES public.workflow_steps(id) ON DELETE SET NULL not valid;

alter table "public"."workflow_logs" validate constraint "workflow_logs_step_id_fkey";

alter table "public"."workflow_logs" add constraint "workflow_logs_workflow_id_fkey" FOREIGN KEY (workflow_id) REFERENCES public.workflows(id) ON DELETE CASCADE not valid;

alter table "public"."workflow_logs" validate constraint "workflow_logs_workflow_id_fkey";

alter table "public"."workflow_steps" add constraint "workflow_steps_ai_action_check" CHECK ((ai_action = ANY (ARRAY['ask_question'::text, 'give_information'::text, 'use_knowledge_base'::text, 'save_user_response'::text, 'branch'::text, 'end'::text]))) not valid;

alter table "public"."workflow_steps" validate constraint "workflow_steps_ai_action_check";

alter table "public"."workflow_steps" add constraint "workflow_steps_workflow_id_fkey" FOREIGN KEY (workflow_id) REFERENCES public.workflows(id) ON DELETE CASCADE not valid;

alter table "public"."workflow_steps" validate constraint "workflow_steps_workflow_id_fkey";

alter table "public"."workflows" add constraint "workflows_mode_check" CHECK ((mode = ANY (ARRAY['strict'::text, 'smart'::text]))) not valid;

alter table "public"."workflows" validate constraint "workflows_mode_check";

alter table "public"."workflows" add constraint "workflows_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE not valid;

alter table "public"."workflows" validate constraint "workflows_organization_id_fkey";

alter table "public"."workflows" add constraint "workflows_trigger_type_check" CHECK ((trigger_type = ANY (ARRAY['keyword'::text, 'intent'::text, 'always'::text]))) not valid;

alter table "public"."workflows" validate constraint "workflows_trigger_type_check";

set check_function_bodies = off;

create or replace view "public"."ai_failures_last_24h_view" as  SELECT id,
    organization_id,
    conversation_id,
    request_id,
    channel,
    caller_type,
    input_message_id,
    output_message_id,
    user_text,
    intent,
    workflow_id,
    kb_used,
    kb_reason,
    kb_threshold,
    kb_top_score,
    kb_chunks,
    model_provider,
    model_name,
    prompt_hash,
    prompt_tokens,
    completion_tokens,
    total_tokens,
    estimated_cost_usd,
    decision,
    error_stage,
    error,
    status,
    started_at,
    finished_at
   FROM public.ai_turn_traces
  WHERE ((started_at >= (now() - '24:00:00'::interval)) AND (status = 'failed'::text))
  ORDER BY started_at DESC;


create or replace view "public"."campaign_analytics_summary" as  SELECT c.organization_id,
    c.id AS campaign_id,
    count(cm.id) AS total_messages,
    count(DISTINCT cm.contact_id) AS total_contacts
   FROM (public.campaigns c
     LEFT JOIN public.campaign_messages cm ON ((cm.campaign_id = c.id)))
  GROUP BY c.organization_id, c.id;


create or replace view "public"."campaign_analytics_summary_v2" as  SELECT organization_id,
    campaign_id,
    total_messages,
    total_contacts
   FROM public.campaign_analytics_summary;


create or replace view "public"."campaign_message_status_summary" as  SELECT campaign_id,
    (count(*))::integer AS total,
    (count(*) FILTER (WHERE (status = 'pending'::public.campaign_message_status)))::integer AS pending_count,
    (count(*) FILTER (WHERE (status = 'queued'::public.campaign_message_status)))::integer AS queued_count,
    (count(*) FILTER (WHERE (status = 'sent'::public.campaign_message_status)))::integer AS sent_count,
    (count(*) FILTER (WHERE (status = 'delivered'::public.campaign_message_status)))::integer AS delivered_count,
    (count(*) FILTER (WHERE (status = 'failed'::public.campaign_message_status)))::integer AS failed_count,
    (count(*) FILTER (WHERE (status = 'cancelled'::public.campaign_message_status)))::integer AS cancelled_count,
    max(dispatched_at) AS last_dispatched_at,
    max(delivered_at) AS last_delivered_at
   FROM public.campaign_messages cm
  GROUP BY campaign_id;


CREATE OR REPLACE FUNCTION public.claim_background_jobs(p_limit integer, p_worker_id text, p_lock_ttl_seconds integer DEFAULT 300)
 RETURNS SETOF public.background_jobs
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with picked as (
    select id
    from public.background_jobs
    where status = 'queued'
      and run_at <= now()
      and (locked_at is null or locked_at < now() - (p_lock_ttl_seconds || ' seconds')::interval)
    order by run_at asc
    for update skip locked
    limit p_limit
  )
  update public.background_jobs bj
  set
    status = 'running',
    locked_at = now(),
    locked_by = p_worker_id,
    attempts = attempts + 1,
    updated_at = now()
  where bj.id in (select id from picked)
  returning *;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_campaign_messages(p_campaign_id uuid, p_limit integer, p_worker_id text, p_lock_ttl_seconds integer DEFAULT 300)
 RETURNS SETOF public.campaign_messages
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ttl interval := make_interval(secs => greatest(p_lock_ttl_seconds, 30));
begin
  return query
  with candidates as (
    select cm.id
    from public.campaign_messages cm
    where cm.campaign_id = p_campaign_id
      and cm.status in ('pending', 'queued')
      and (cm.next_retry_at is null or cm.next_retry_at <= now())
      and (cm.locked_at is null or cm.locked_at <= now() - v_ttl)
    order by cm.created_at asc
    limit greatest(p_limit, 0)
    for update skip locked
  )
  update public.campaign_messages cm
  set
    status = 'queued',
    locked_at = now(),
    locked_by = p_worker_id,
    send_attempts = cm.send_attempts + 1,
    last_attempt_at = now()
  where cm.id in (select id from candidates)
  returning cm.*;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.consume_ai_quota(p_organization_id uuid, p_estimated_tokens integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  limits record;
  win_start timestamptz;
  rowrec record;
begin
  select * into limits
  from public.ai_org_rate_limits
  where organization_id = p_organization_id;

  -- If there is no limits row, allow by default (can be configured later).
  if limits is null or limits.enabled = false then
    return jsonb_build_object('allowed', true, 'window_start', null);
  end if;

  win_start := to_timestamp(
    floor(extract(epoch from now()) / limits.window_seconds) * limits.window_seconds
  );

  insert into public.ai_org_rate_limit_usage (organization_id, window_start, request_count, token_count)
  values (p_organization_id, win_start, 1, greatest(p_estimated_tokens, 0))
  on conflict (organization_id, window_start)
  do update set
    request_count = public.ai_org_rate_limit_usage.request_count + 1,
    token_count   = public.ai_org_rate_limit_usage.token_count + greatest(p_estimated_tokens, 0)
  returning request_count, token_count into rowrec;

  if rowrec.request_count > limits.max_requests or rowrec.token_count > limits.max_tokens then
    raise exception 'ai_rate_limit_exceeded' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'allowed', true,
    'window_start', win_start,
    'request_count', rowrec.request_count,
    'token_count', rowrec.token_count
  );
end;
$function$
;

create or replace view "public"."contact_campaign_summary" as  SELECT ct.id AS contact_id,
    ct.organization_id,
    ct.first_name,
    ct.last_name,
    ct.phone,
    ct.model,
    COALESCE(array_remove(array_agg(DISTINCT COALESCE(c.template_name, c.name)) FILTER (WHERE (cm.status = 'delivered'::public.campaign_message_status)), NULL::text), '{}'::text[]) AS delivered_campaigns,
    COALESCE(array_remove(array_agg(DISTINCT COALESCE(c.template_name, c.name)) FILTER (WHERE (cm.status = 'failed'::public.campaign_message_status)), NULL::text), '{}'::text[]) AS failed_campaigns
   FROM ((public.contacts ct
     LEFT JOIN public.campaign_messages cm ON (((cm.organization_id = ct.organization_id) AND (cm.phone = ct.phone))))
     LEFT JOIN public.campaigns c ON (((c.id = cm.campaign_id) AND (c.organization_id = ct.organization_id))))
  GROUP BY ct.id, ct.organization_id, ct.first_name, ct.last_name, ct.phone, ct.model;


CREATE OR REPLACE FUNCTION public.create_psf_case_on_campaign_message()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  camp public.campaigns;
BEGIN
  SELECT * INTO camp
  FROM public.campaigns
  WHERE id = NEW.campaign_id;

  IF camp.campaign_kind = 'psf_initial' THEN
    INSERT INTO public.psf_cases (
      organization_id,
      campaign_id,
      phone,
      uploaded_data,
      initial_sent_at
    )
    VALUES (
      camp.organization_id,
      camp.id,
      NEW.phone,
      COALESCE(NEW.variables, '{}'::jsonb),
      now()
    )
    ON CONFLICT (campaign_id, phone) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$
;

create or replace view "public"."delivery_failures_last_24h_view" as  SELECT id,
    organization_id,
    message_id,
    campaign_message_id,
    event_type,
    source,
    event_at,
    payload
   FROM public.message_delivery_events
  WHERE ((event_at >= (now() - '24:00:00'::interval)) AND (event_type = 'failed'::text))
  ORDER BY event_at DESC;


create or replace view "public"."failure_reason_summary" as  SELECT organization_id,
    'unknown'::text AS failure_reason,
    count(*) AS total
   FROM public.campaigns c
  GROUP BY organization_id;


create type "public"."http_header" as ("field" character varying, "value" character varying);

create type "public"."http_request" as ("method" public.http_method, "uri" character varying, "headers" public.http_header[], "content_type" character varying, "content" character varying);

create type "public"."http_response" as ("status" integer, "content_type" character varying, "headers" public.http_header[], "content" character varying);

CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(query_embedding public.vector, match_count integer DEFAULT 20, match_threshold double precision DEFAULT 0.3)
 RETURNS TABLE(id uuid, article_id uuid, chunk text, similarity double precision)
 LANGUAGE sql
 STABLE
AS $function$
  select
    kc.id,
    kc.article_id,
    kc.chunk,
    1 - (kc.embedding <=> query_embedding) as similarity
  from knowledge_chunks kc
  where kc.embedding <=> query_embedding < 1 - match_threshold
  order by kc.embedding <=> query_embedding
  limit match_count;
$function$
;

CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(query_embedding public.vector, match_count integer DEFAULT 20, match_threshold double precision DEFAULT 0.3, p_organization_id uuid DEFAULT NULL::uuid, p_only_published boolean DEFAULT true)
 RETURNS TABLE(id uuid, article_id uuid, chunk text, similarity double precision, article_title text)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    kc.id,
    kc.article_id,
    kc.chunk,
    1 - (kc.embedding <=> query_embedding) AS similarity,
    ka.title AS article_title
  FROM public.knowledge_chunks kc
  JOIN public.knowledge_articles ka ON ka.id = kc.article_id
  WHERE (p_organization_id IS NULL OR ka.organization_id = p_organization_id)
    AND (NOT p_only_published OR ka.status = 'published')
    AND kc.embedding <=> query_embedding < 1 - match_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
$function$
;

CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(query_embedding public.vector, match_threshold double precision, match_count integer, org_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(article_id uuid, organization_id uuid, content text, similarity double precision)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    kc.article_id,
    kc.organization_id,
    kc.chunk AS content,
    1 - (kc.embedding <=> query_embedding) AS similarity
  FROM knowledge_chunks kc
  WHERE
    (org_id IS NULL OR kc.organization_id = org_id)
    AND 1 - (kc.embedding <=> query_embedding) >= match_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
$function$
;

CREATE OR REPLACE FUNCTION public.match_knowledge_chunks_scoped(query_embedding public.vector, p_organization_id uuid, match_count integer, match_threshold double precision, p_only_published boolean)
 RETURNS TABLE(id uuid, article_id uuid, article_title text, chunk text, similarity double precision)
 LANGUAGE sql
 STABLE
AS $function$
  select
    kc.id,
    kc.article_id,
    ka.title as article_title,
    kc.chunk,
    1 - (kc.embedding <=> query_embedding) as similarity
  from knowledge_chunks kc
  join knowledge_articles ka on ka.id = kc.article_id
  where
    ka.organization_id = p_organization_id
    and (not p_only_published or ka.status = 'published')
    and 1 - (kc.embedding <=> query_embedding) >= match_threshold
  order by kc.embedding <=> query_embedding
  limit match_count;
$function$
;

create or replace view "public"."model_analytics_summary" as  SELECT organization_id,
    count(*) AS total_campaigns
   FROM public.campaigns
  GROUP BY organization_id;


CREATE OR REPLACE FUNCTION public.phase5_create_wallet_for_org()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.wallets (organization_id)
  values (new.id)
  on conflict (organization_id) do nothing;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.phase5_wallet_apply_transaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.direction = 'in' then
    update public.wallets
      set balance = balance + new.amount,
          total_credited = total_credited + new.amount,
          updated_at = now()
    where id = new.wallet_id;
  else
    update public.wallets
      set balance = balance - new.amount,
          total_debited = total_debited + new.amount,
          updated_at = now()
    where id = new.wallet_id;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.phase5_wallet_manual_credit(p_organization_id uuid, p_amount numeric, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid;
  v_role text;
  v_wallet_id uuid;
  v_txn_id uuid;
  v_balance_after numeric(12,4);
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_organization_id is null then
    raise exception 'organization_id is required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be > 0';
  end if;

  select ou.role
    into v_role
  from public.organization_users ou
  where ou.organization_id = p_organization_id
    and ou.user_id = v_uid
  limit 1;

  if v_role is null or v_role not in ('owner','admin') then
    raise exception 'Insufficient permissions (owner/admin required)';
  end if;

  select w.id
    into v_wallet_id
  from public.wallets w
  where w.organization_id = p_organization_id
  limit 1;

  if v_wallet_id is null then
    insert into public.wallets (organization_id)
    values (p_organization_id)
    on conflict (organization_id) do update set updated_at = now()
    returning id into v_wallet_id;
  end if;

  insert into public.wallet_transactions (
    wallet_id,
    type,
    direction,
    amount,
    reference_type,
    reference_id,
    metadata,
    purpose,
    created_by,
    created_by_role
  )
  values (
    v_wallet_id,
    'credit',
    'in',
    p_amount,
    'manual',
    null,
    jsonb_build_object('note', p_note),
    'manual_credit',
    v_uid,
    v_role
  )
  returning id, balance_after into v_txn_id, v_balance_after;

  return jsonb_build_object(
    'transaction_id', v_txn_id,
    'wallet_id', v_wallet_id,
    'balance_after', v_balance_after,
    'role', v_role
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.phase5_wallet_prevent_negative_balance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_balance numeric(12,4);
begin
  -- Lock wallet row so snapshots are race-free.
  select w.balance
    into v_balance
  from public.wallets w
  where w.id = new.wallet_id
  for update;

  if v_balance is null then
    raise exception 'Wallet not found for wallet_id=%', new.wallet_id;
  end if;

  if new.direction = 'out' then
    if v_balance < new.amount then
      raise exception 'Insufficient wallet balance. Required=%, Available=%',
        new.amount, v_balance;
    end if;

    new.balance_before := v_balance;
    new.balance_after  := v_balance - new.amount;
  else
    new.balance_before := v_balance;
    new.balance_after  := v_balance + new.amount;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.phase6_log_unanswered_question(p_organization_id uuid, p_conversation_id uuid, p_channel text, p_user_message text, p_ai_response text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.unanswered_questions (
    organization_id,
    conversation_id,
    channel,
    question,
    ai_response,
    status,
    occurrences,
    last_seen_at
  )
  VALUES (
    p_organization_id,
    p_conversation_id,
    p_channel,
    p_user_message,
    p_ai_response,
    'open',
    1,
    now()
  )
  ON CONFLICT (organization_id, question)
  DO UPDATE SET
    occurrences = unanswered_questions.occurrences + 1,
    last_seen_at = now(),
    ai_response = excluded.ai_response;
END;
$function$
;

create or replace view "public"."psf_cases_view" as  SELECT pc.id,
    pc.organization_id,
    pc.phone,
    pc.customer_name,
    pc.uploaded_data,
    pc.sentiment,
    pc.ai_summary,
    pc.action_required,
    pc.resolution_status,
    pc.resolved_at,
    pc.reminder_count,
    pc.last_reminder_at,
    pc.initial_sent_at,
    pc.first_customer_reply_at,
    pc.last_customer_reply_at,
    pc.created_at,
    c.id AS conversation_id,
    c.channel,
    c.last_message_at
   FROM (public.psf_cases pc
     LEFT JOIN public.conversations c ON ((c.id = pc.conversation_id)));


CREATE OR REPLACE FUNCTION public.set_active_organization(p_organization_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- ensure the caller is a member of that org
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Not a member of organization';
  END IF;

  UPDATE public.organization_users
  SET last_active_at = now()
  WHERE user_id = auth.uid()
    AND organization_id = p_organization_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_message_order_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.order_at := coalesce(new.wa_received_at, new.sent_at, new.created_at, now());
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_message_organization_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT c.organization_id
      INTO NEW.organization_id
    FROM public.conversations c
    WHERE c.id = NEW.conversation_id;
  END IF;

  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'messages.organization_id is required and could not be derived from conversation_id';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_unanswered_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end $function$
;

create or replace view "public"."stuck_campaign_messages_view" as  SELECT id,
    organization_id,
    campaign_id,
    contact_id,
    phone,
    variables,
    status,
    error,
    whatsapp_message_id,
    dispatched_at,
    delivered_at,
    created_at,
    replied_at,
    reply_whatsapp_message_id,
    reply_text,
    rendered_text,
    raw_row,
    send_attempts,
    next_retry_at,
    locked_at,
    locked_by,
    last_attempt_at
   FROM public.campaign_messages cm
  WHERE ((status = ANY (ARRAY['pending'::public.campaign_message_status, 'queued'::public.campaign_message_status])) AND (((locked_at IS NOT NULL) AND (locked_at < (now() - '00:10:00'::interval))) OR ((next_retry_at IS NOT NULL) AND (next_retry_at < (now() - '00:10:00'::interval)))))
  ORDER BY created_at;


create or replace view "public"."template_analytics_summary" as  SELECT c.organization_id,
    c.whatsapp_template_id,
    count(cm.id) AS total_messages
   FROM (public.campaigns c
     JOIN public.campaign_messages cm ON ((cm.campaign_id = c.id)))
  GROUP BY c.organization_id, c.whatsapp_template_id;


create or replace view "public"."template_analytics_summary_v2" as  SELECT organization_id,
    whatsapp_template_id,
    total_messages
   FROM public.template_analytics_summary;


CREATE OR REPLACE FUNCTION public.update_psf_cases_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

create or replace view "public"."user_active_organization" as  SELECT DISTINCT ON (ou.user_id) ou.user_id,
    ou.organization_id,
    o.name,
    COALESCE(ou.last_active_at, ou.created_at) AS active_at
   FROM (public.organization_users ou
     JOIN public.organizations o ON ((o.id = ou.organization_id)))
  ORDER BY ou.user_id, COALESCE(ou.last_active_at, ou.created_at) DESC;


create or replace view "public"."whatsapp_overview_daily_v1" as  SELECT c.organization_id,
    date_trunc('day'::text, m.created_at) AS day,
    count(*) AS total_messages,
    count(DISTINCT c.id) AS total_conversations,
    count(DISTINCT c.contact_id) AS total_contacts
   FROM (public.conversations c
     JOIN public.messages m ON ((m.conversation_id = c.id)))
  GROUP BY c.organization_id, (date_trunc('day'::text, m.created_at));


grant delete on table "public"."ai_embeddings_cache" to "anon";

grant insert on table "public"."ai_embeddings_cache" to "anon";

grant references on table "public"."ai_embeddings_cache" to "anon";

grant select on table "public"."ai_embeddings_cache" to "anon";

grant trigger on table "public"."ai_embeddings_cache" to "anon";

grant truncate on table "public"."ai_embeddings_cache" to "anon";

grant update on table "public"."ai_embeddings_cache" to "anon";

grant delete on table "public"."ai_embeddings_cache" to "authenticated";

grant insert on table "public"."ai_embeddings_cache" to "authenticated";

grant references on table "public"."ai_embeddings_cache" to "authenticated";

grant select on table "public"."ai_embeddings_cache" to "authenticated";

grant trigger on table "public"."ai_embeddings_cache" to "authenticated";

grant truncate on table "public"."ai_embeddings_cache" to "authenticated";

grant update on table "public"."ai_embeddings_cache" to "authenticated";

grant delete on table "public"."ai_embeddings_cache" to "service_role";

grant insert on table "public"."ai_embeddings_cache" to "service_role";

grant references on table "public"."ai_embeddings_cache" to "service_role";

grant select on table "public"."ai_embeddings_cache" to "service_role";

grant trigger on table "public"."ai_embeddings_cache" to "service_role";

grant truncate on table "public"."ai_embeddings_cache" to "service_role";

grant update on table "public"."ai_embeddings_cache" to "service_role";

grant delete on table "public"."ai_org_rate_limit_usage" to "anon";

grant insert on table "public"."ai_org_rate_limit_usage" to "anon";

grant references on table "public"."ai_org_rate_limit_usage" to "anon";

grant select on table "public"."ai_org_rate_limit_usage" to "anon";

grant trigger on table "public"."ai_org_rate_limit_usage" to "anon";

grant truncate on table "public"."ai_org_rate_limit_usage" to "anon";

grant update on table "public"."ai_org_rate_limit_usage" to "anon";

grant delete on table "public"."ai_org_rate_limit_usage" to "authenticated";

grant insert on table "public"."ai_org_rate_limit_usage" to "authenticated";

grant references on table "public"."ai_org_rate_limit_usage" to "authenticated";

grant select on table "public"."ai_org_rate_limit_usage" to "authenticated";

grant trigger on table "public"."ai_org_rate_limit_usage" to "authenticated";

grant truncate on table "public"."ai_org_rate_limit_usage" to "authenticated";

grant update on table "public"."ai_org_rate_limit_usage" to "authenticated";

grant delete on table "public"."ai_org_rate_limit_usage" to "service_role";

grant insert on table "public"."ai_org_rate_limit_usage" to "service_role";

grant references on table "public"."ai_org_rate_limit_usage" to "service_role";

grant select on table "public"."ai_org_rate_limit_usage" to "service_role";

grant trigger on table "public"."ai_org_rate_limit_usage" to "service_role";

grant truncate on table "public"."ai_org_rate_limit_usage" to "service_role";

grant update on table "public"."ai_org_rate_limit_usage" to "service_role";

grant delete on table "public"."ai_org_rate_limits" to "anon";

grant insert on table "public"."ai_org_rate_limits" to "anon";

grant references on table "public"."ai_org_rate_limits" to "anon";

grant select on table "public"."ai_org_rate_limits" to "anon";

grant trigger on table "public"."ai_org_rate_limits" to "anon";

grant truncate on table "public"."ai_org_rate_limits" to "anon";

grant update on table "public"."ai_org_rate_limits" to "anon";

grant delete on table "public"."ai_org_rate_limits" to "authenticated";

grant insert on table "public"."ai_org_rate_limits" to "authenticated";

grant references on table "public"."ai_org_rate_limits" to "authenticated";

grant select on table "public"."ai_org_rate_limits" to "authenticated";

grant trigger on table "public"."ai_org_rate_limits" to "authenticated";

grant truncate on table "public"."ai_org_rate_limits" to "authenticated";

grant update on table "public"."ai_org_rate_limits" to "authenticated";

grant delete on table "public"."ai_org_rate_limits" to "service_role";

grant insert on table "public"."ai_org_rate_limits" to "service_role";

grant references on table "public"."ai_org_rate_limits" to "service_role";

grant select on table "public"."ai_org_rate_limits" to "service_role";

grant trigger on table "public"."ai_org_rate_limits" to "service_role";

grant truncate on table "public"."ai_org_rate_limits" to "service_role";

grant update on table "public"."ai_org_rate_limits" to "service_role";

grant delete on table "public"."ai_settings" to "anon";

grant insert on table "public"."ai_settings" to "anon";

grant references on table "public"."ai_settings" to "anon";

grant select on table "public"."ai_settings" to "anon";

grant trigger on table "public"."ai_settings" to "anon";

grant truncate on table "public"."ai_settings" to "anon";

grant update on table "public"."ai_settings" to "anon";

grant delete on table "public"."ai_settings" to "authenticated";

grant insert on table "public"."ai_settings" to "authenticated";

grant references on table "public"."ai_settings" to "authenticated";

grant select on table "public"."ai_settings" to "authenticated";

grant trigger on table "public"."ai_settings" to "authenticated";

grant truncate on table "public"."ai_settings" to "authenticated";

grant update on table "public"."ai_settings" to "authenticated";

grant delete on table "public"."ai_settings" to "service_role";

grant insert on table "public"."ai_settings" to "service_role";

grant references on table "public"."ai_settings" to "service_role";

grant select on table "public"."ai_settings" to "service_role";

grant trigger on table "public"."ai_settings" to "service_role";

grant truncate on table "public"."ai_settings" to "service_role";

grant update on table "public"."ai_settings" to "service_role";

grant delete on table "public"."ai_turn_traces" to "anon";

grant insert on table "public"."ai_turn_traces" to "anon";

grant references on table "public"."ai_turn_traces" to "anon";

grant select on table "public"."ai_turn_traces" to "anon";

grant trigger on table "public"."ai_turn_traces" to "anon";

grant truncate on table "public"."ai_turn_traces" to "anon";

grant update on table "public"."ai_turn_traces" to "anon";

grant delete on table "public"."ai_turn_traces" to "authenticated";

grant insert on table "public"."ai_turn_traces" to "authenticated";

grant references on table "public"."ai_turn_traces" to "authenticated";

grant select on table "public"."ai_turn_traces" to "authenticated";

grant trigger on table "public"."ai_turn_traces" to "authenticated";

grant truncate on table "public"."ai_turn_traces" to "authenticated";

grant update on table "public"."ai_turn_traces" to "authenticated";

grant delete on table "public"."ai_turn_traces" to "service_role";

grant insert on table "public"."ai_turn_traces" to "service_role";

grant references on table "public"."ai_turn_traces" to "service_role";

grant select on table "public"."ai_turn_traces" to "service_role";

grant trigger on table "public"."ai_turn_traces" to "service_role";

grant truncate on table "public"."ai_turn_traces" to "service_role";

grant update on table "public"."ai_turn_traces" to "service_role";

grant delete on table "public"."ai_usage_logs" to "anon";

grant insert on table "public"."ai_usage_logs" to "anon";

grant references on table "public"."ai_usage_logs" to "anon";

grant select on table "public"."ai_usage_logs" to "anon";

grant trigger on table "public"."ai_usage_logs" to "anon";

grant truncate on table "public"."ai_usage_logs" to "anon";

grant update on table "public"."ai_usage_logs" to "anon";

grant delete on table "public"."ai_usage_logs" to "authenticated";

grant insert on table "public"."ai_usage_logs" to "authenticated";

grant references on table "public"."ai_usage_logs" to "authenticated";

grant select on table "public"."ai_usage_logs" to "authenticated";

grant trigger on table "public"."ai_usage_logs" to "authenticated";

grant truncate on table "public"."ai_usage_logs" to "authenticated";

grant update on table "public"."ai_usage_logs" to "authenticated";

grant delete on table "public"."ai_usage_logs" to "service_role";

grant insert on table "public"."ai_usage_logs" to "service_role";

grant references on table "public"."ai_usage_logs" to "service_role";

grant select on table "public"."ai_usage_logs" to "service_role";

grant trigger on table "public"."ai_usage_logs" to "service_role";

grant truncate on table "public"."ai_usage_logs" to "service_role";

grant update on table "public"."ai_usage_logs" to "service_role";

grant delete on table "public"."audit_logs" to "anon";

grant insert on table "public"."audit_logs" to "anon";

grant references on table "public"."audit_logs" to "anon";

grant select on table "public"."audit_logs" to "anon";

grant trigger on table "public"."audit_logs" to "anon";

grant truncate on table "public"."audit_logs" to "anon";

grant update on table "public"."audit_logs" to "anon";

grant delete on table "public"."audit_logs" to "authenticated";

grant insert on table "public"."audit_logs" to "authenticated";

grant references on table "public"."audit_logs" to "authenticated";

grant select on table "public"."audit_logs" to "authenticated";

grant trigger on table "public"."audit_logs" to "authenticated";

grant truncate on table "public"."audit_logs" to "authenticated";

grant update on table "public"."audit_logs" to "authenticated";

grant delete on table "public"."audit_logs" to "service_role";

grant insert on table "public"."audit_logs" to "service_role";

grant references on table "public"."audit_logs" to "service_role";

grant select on table "public"."audit_logs" to "service_role";

grant trigger on table "public"."audit_logs" to "service_role";

grant truncate on table "public"."audit_logs" to "service_role";

grant update on table "public"."audit_logs" to "service_role";

grant delete on table "public"."background_jobs" to "anon";

grant insert on table "public"."background_jobs" to "anon";

grant references on table "public"."background_jobs" to "anon";

grant select on table "public"."background_jobs" to "anon";

grant trigger on table "public"."background_jobs" to "anon";

grant truncate on table "public"."background_jobs" to "anon";

grant update on table "public"."background_jobs" to "anon";

grant delete on table "public"."background_jobs" to "authenticated";

grant insert on table "public"."background_jobs" to "authenticated";

grant references on table "public"."background_jobs" to "authenticated";

grant select on table "public"."background_jobs" to "authenticated";

grant trigger on table "public"."background_jobs" to "authenticated";

grant truncate on table "public"."background_jobs" to "authenticated";

grant update on table "public"."background_jobs" to "authenticated";

grant delete on table "public"."background_jobs" to "service_role";

grant insert on table "public"."background_jobs" to "service_role";

grant references on table "public"."background_jobs" to "service_role";

grant select on table "public"."background_jobs" to "service_role";

grant trigger on table "public"."background_jobs" to "service_role";

grant truncate on table "public"."background_jobs" to "service_role";

grant update on table "public"."background_jobs" to "service_role";

grant delete on table "public"."bot_instructions" to "anon";

grant insert on table "public"."bot_instructions" to "anon";

grant references on table "public"."bot_instructions" to "anon";

grant select on table "public"."bot_instructions" to "anon";

grant trigger on table "public"."bot_instructions" to "anon";

grant truncate on table "public"."bot_instructions" to "anon";

grant update on table "public"."bot_instructions" to "anon";

grant delete on table "public"."bot_instructions" to "authenticated";

grant insert on table "public"."bot_instructions" to "authenticated";

grant references on table "public"."bot_instructions" to "authenticated";

grant select on table "public"."bot_instructions" to "authenticated";

grant trigger on table "public"."bot_instructions" to "authenticated";

grant truncate on table "public"."bot_instructions" to "authenticated";

grant update on table "public"."bot_instructions" to "authenticated";

grant delete on table "public"."bot_instructions" to "service_role";

grant insert on table "public"."bot_instructions" to "service_role";

grant references on table "public"."bot_instructions" to "service_role";

grant select on table "public"."bot_instructions" to "service_role";

grant trigger on table "public"."bot_instructions" to "service_role";

grant truncate on table "public"."bot_instructions" to "service_role";

grant update on table "public"."bot_instructions" to "service_role";

grant delete on table "public"."bot_personality" to "anon";

grant insert on table "public"."bot_personality" to "anon";

grant references on table "public"."bot_personality" to "anon";

grant select on table "public"."bot_personality" to "anon";

grant trigger on table "public"."bot_personality" to "anon";

grant truncate on table "public"."bot_personality" to "anon";

grant update on table "public"."bot_personality" to "anon";

grant delete on table "public"."bot_personality" to "authenticated";

grant insert on table "public"."bot_personality" to "authenticated";

grant references on table "public"."bot_personality" to "authenticated";

grant select on table "public"."bot_personality" to "authenticated";

grant trigger on table "public"."bot_personality" to "authenticated";

grant truncate on table "public"."bot_personality" to "authenticated";

grant update on table "public"."bot_personality" to "authenticated";

grant delete on table "public"."bot_personality" to "service_role";

grant insert on table "public"."bot_personality" to "service_role";

grant references on table "public"."bot_personality" to "service_role";

grant select on table "public"."bot_personality" to "service_role";

grant trigger on table "public"."bot_personality" to "service_role";

grant truncate on table "public"."bot_personality" to "service_role";

grant update on table "public"."bot_personality" to "service_role";

grant delete on table "public"."campaign_delivery_import" to "anon";

grant insert on table "public"."campaign_delivery_import" to "anon";

grant references on table "public"."campaign_delivery_import" to "anon";

grant select on table "public"."campaign_delivery_import" to "anon";

grant trigger on table "public"."campaign_delivery_import" to "anon";

grant truncate on table "public"."campaign_delivery_import" to "anon";

grant update on table "public"."campaign_delivery_import" to "anon";

grant delete on table "public"."campaign_delivery_import" to "authenticated";

grant insert on table "public"."campaign_delivery_import" to "authenticated";

grant references on table "public"."campaign_delivery_import" to "authenticated";

grant select on table "public"."campaign_delivery_import" to "authenticated";

grant trigger on table "public"."campaign_delivery_import" to "authenticated";

grant truncate on table "public"."campaign_delivery_import" to "authenticated";

grant update on table "public"."campaign_delivery_import" to "authenticated";

grant delete on table "public"."campaign_delivery_import" to "service_role";

grant insert on table "public"."campaign_delivery_import" to "service_role";

grant references on table "public"."campaign_delivery_import" to "service_role";

grant select on table "public"."campaign_delivery_import" to "service_role";

grant trigger on table "public"."campaign_delivery_import" to "service_role";

grant truncate on table "public"."campaign_delivery_import" to "service_role";

grant update on table "public"."campaign_delivery_import" to "service_role";

grant delete on table "public"."campaign_delivery_receipt_failures" to "anon";

grant insert on table "public"."campaign_delivery_receipt_failures" to "anon";

grant references on table "public"."campaign_delivery_receipt_failures" to "anon";

grant select on table "public"."campaign_delivery_receipt_failures" to "anon";

grant trigger on table "public"."campaign_delivery_receipt_failures" to "anon";

grant truncate on table "public"."campaign_delivery_receipt_failures" to "anon";

grant update on table "public"."campaign_delivery_receipt_failures" to "anon";

grant delete on table "public"."campaign_delivery_receipt_failures" to "authenticated";

grant insert on table "public"."campaign_delivery_receipt_failures" to "authenticated";

grant references on table "public"."campaign_delivery_receipt_failures" to "authenticated";

grant select on table "public"."campaign_delivery_receipt_failures" to "authenticated";

grant trigger on table "public"."campaign_delivery_receipt_failures" to "authenticated";

grant truncate on table "public"."campaign_delivery_receipt_failures" to "authenticated";

grant update on table "public"."campaign_delivery_receipt_failures" to "authenticated";

grant delete on table "public"."campaign_delivery_receipt_failures" to "service_role";

grant insert on table "public"."campaign_delivery_receipt_failures" to "service_role";

grant references on table "public"."campaign_delivery_receipt_failures" to "service_role";

grant select on table "public"."campaign_delivery_receipt_failures" to "service_role";

grant trigger on table "public"."campaign_delivery_receipt_failures" to "service_role";

grant truncate on table "public"."campaign_delivery_receipt_failures" to "service_role";

grant update on table "public"."campaign_delivery_receipt_failures" to "service_role";

grant delete on table "public"."campaign_messages" to "anon";

grant insert on table "public"."campaign_messages" to "anon";

grant references on table "public"."campaign_messages" to "anon";

grant select on table "public"."campaign_messages" to "anon";

grant trigger on table "public"."campaign_messages" to "anon";

grant truncate on table "public"."campaign_messages" to "anon";

grant update on table "public"."campaign_messages" to "anon";

grant delete on table "public"."campaign_messages" to "authenticated";

grant insert on table "public"."campaign_messages" to "authenticated";

grant references on table "public"."campaign_messages" to "authenticated";

grant select on table "public"."campaign_messages" to "authenticated";

grant trigger on table "public"."campaign_messages" to "authenticated";

grant truncate on table "public"."campaign_messages" to "authenticated";

grant update on table "public"."campaign_messages" to "authenticated";

grant delete on table "public"."campaign_messages" to "service_role";

grant insert on table "public"."campaign_messages" to "service_role";

grant references on table "public"."campaign_messages" to "service_role";

grant select on table "public"."campaign_messages" to "service_role";

grant trigger on table "public"."campaign_messages" to "service_role";

grant truncate on table "public"."campaign_messages" to "service_role";

grant update on table "public"."campaign_messages" to "service_role";

grant delete on table "public"."campaigns" to "anon";

grant insert on table "public"."campaigns" to "anon";

grant references on table "public"."campaigns" to "anon";

grant select on table "public"."campaigns" to "anon";

grant trigger on table "public"."campaigns" to "anon";

grant truncate on table "public"."campaigns" to "anon";

grant update on table "public"."campaigns" to "anon";

grant delete on table "public"."campaigns" to "authenticated";

grant insert on table "public"."campaigns" to "authenticated";

grant references on table "public"."campaigns" to "authenticated";

grant select on table "public"."campaigns" to "authenticated";

grant trigger on table "public"."campaigns" to "authenticated";

grant truncate on table "public"."campaigns" to "authenticated";

grant update on table "public"."campaigns" to "authenticated";

grant delete on table "public"."campaigns" to "service_role";

grant insert on table "public"."campaigns" to "service_role";

grant references on table "public"."campaigns" to "service_role";

grant select on table "public"."campaigns" to "service_role";

grant trigger on table "public"."campaigns" to "service_role";

grant truncate on table "public"."campaigns" to "service_role";

grant update on table "public"."campaigns" to "service_role";

grant delete on table "public"."contact_uploads" to "anon";

grant insert on table "public"."contact_uploads" to "anon";

grant references on table "public"."contact_uploads" to "anon";

grant select on table "public"."contact_uploads" to "anon";

grant trigger on table "public"."contact_uploads" to "anon";

grant truncate on table "public"."contact_uploads" to "anon";

grant update on table "public"."contact_uploads" to "anon";

grant delete on table "public"."contact_uploads" to "authenticated";

grant insert on table "public"."contact_uploads" to "authenticated";

grant references on table "public"."contact_uploads" to "authenticated";

grant select on table "public"."contact_uploads" to "authenticated";

grant trigger on table "public"."contact_uploads" to "authenticated";

grant truncate on table "public"."contact_uploads" to "authenticated";

grant update on table "public"."contact_uploads" to "authenticated";

grant delete on table "public"."contact_uploads" to "service_role";

grant insert on table "public"."contact_uploads" to "service_role";

grant references on table "public"."contact_uploads" to "service_role";

grant select on table "public"."contact_uploads" to "service_role";

grant trigger on table "public"."contact_uploads" to "service_role";

grant truncate on table "public"."contact_uploads" to "service_role";

grant update on table "public"."contact_uploads" to "service_role";

grant delete on table "public"."contacts" to "anon";

grant insert on table "public"."contacts" to "anon";

grant references on table "public"."contacts" to "anon";

grant select on table "public"."contacts" to "anon";

grant trigger on table "public"."contacts" to "anon";

grant truncate on table "public"."contacts" to "anon";

grant update on table "public"."contacts" to "anon";

grant delete on table "public"."contacts" to "authenticated";

grant insert on table "public"."contacts" to "authenticated";

grant references on table "public"."contacts" to "authenticated";

grant select on table "public"."contacts" to "authenticated";

grant trigger on table "public"."contacts" to "authenticated";

grant truncate on table "public"."contacts" to "authenticated";

grant update on table "public"."contacts" to "authenticated";

grant delete on table "public"."contacts" to "service_role";

grant insert on table "public"."contacts" to "service_role";

grant references on table "public"."contacts" to "service_role";

grant select on table "public"."contacts" to "service_role";

grant trigger on table "public"."contacts" to "service_role";

grant truncate on table "public"."contacts" to "service_role";

grant update on table "public"."contacts" to "service_role";

grant delete on table "public"."conversation_state" to "anon";

grant insert on table "public"."conversation_state" to "anon";

grant references on table "public"."conversation_state" to "anon";

grant select on table "public"."conversation_state" to "anon";

grant trigger on table "public"."conversation_state" to "anon";

grant truncate on table "public"."conversation_state" to "anon";

grant update on table "public"."conversation_state" to "anon";

grant delete on table "public"."conversation_state" to "authenticated";

grant insert on table "public"."conversation_state" to "authenticated";

grant references on table "public"."conversation_state" to "authenticated";

grant select on table "public"."conversation_state" to "authenticated";

grant trigger on table "public"."conversation_state" to "authenticated";

grant truncate on table "public"."conversation_state" to "authenticated";

grant update on table "public"."conversation_state" to "authenticated";

grant delete on table "public"."conversation_state" to "service_role";

grant insert on table "public"."conversation_state" to "service_role";

grant references on table "public"."conversation_state" to "service_role";

grant select on table "public"."conversation_state" to "service_role";

grant trigger on table "public"."conversation_state" to "service_role";

grant truncate on table "public"."conversation_state" to "service_role";

grant update on table "public"."conversation_state" to "service_role";

grant delete on table "public"."conversations" to "anon";

grant insert on table "public"."conversations" to "anon";

grant references on table "public"."conversations" to "anon";

grant select on table "public"."conversations" to "anon";

grant trigger on table "public"."conversations" to "anon";

grant truncate on table "public"."conversations" to "anon";

grant update on table "public"."conversations" to "anon";

grant delete on table "public"."conversations" to "authenticated";

grant insert on table "public"."conversations" to "authenticated";

grant references on table "public"."conversations" to "authenticated";

grant select on table "public"."conversations" to "authenticated";

grant trigger on table "public"."conversations" to "authenticated";

grant truncate on table "public"."conversations" to "authenticated";

grant update on table "public"."conversations" to "authenticated";

grant delete on table "public"."conversations" to "service_role";

grant insert on table "public"."conversations" to "service_role";

grant references on table "public"."conversations" to "service_role";

grant select on table "public"."conversations" to "service_role";

grant trigger on table "public"."conversations" to "service_role";

grant truncate on table "public"."conversations" to "service_role";

grant update on table "public"."conversations" to "service_role";

grant delete on table "public"."knowledge_articles" to "anon";

grant insert on table "public"."knowledge_articles" to "anon";

grant references on table "public"."knowledge_articles" to "anon";

grant select on table "public"."knowledge_articles" to "anon";

grant trigger on table "public"."knowledge_articles" to "anon";

grant truncate on table "public"."knowledge_articles" to "anon";

grant update on table "public"."knowledge_articles" to "anon";

grant delete on table "public"."knowledge_articles" to "authenticated";

grant insert on table "public"."knowledge_articles" to "authenticated";

grant references on table "public"."knowledge_articles" to "authenticated";

grant select on table "public"."knowledge_articles" to "authenticated";

grant trigger on table "public"."knowledge_articles" to "authenticated";

grant truncate on table "public"."knowledge_articles" to "authenticated";

grant update on table "public"."knowledge_articles" to "authenticated";

grant delete on table "public"."knowledge_articles" to "service_role";

grant insert on table "public"."knowledge_articles" to "service_role";

grant references on table "public"."knowledge_articles" to "service_role";

grant select on table "public"."knowledge_articles" to "service_role";

grant trigger on table "public"."knowledge_articles" to "service_role";

grant truncate on table "public"."knowledge_articles" to "service_role";

grant update on table "public"."knowledge_articles" to "service_role";

grant select on table "public"."knowledge_chunks" to "authenticated";

grant delete on table "public"."knowledge_chunks" to "service_role";

grant insert on table "public"."knowledge_chunks" to "service_role";

grant references on table "public"."knowledge_chunks" to "service_role";

grant select on table "public"."knowledge_chunks" to "service_role";

grant trigger on table "public"."knowledge_chunks" to "service_role";

grant truncate on table "public"."knowledge_chunks" to "service_role";

grant update on table "public"."knowledge_chunks" to "service_role";

grant delete on table "public"."message_delivery_dlq" to "anon";

grant insert on table "public"."message_delivery_dlq" to "anon";

grant references on table "public"."message_delivery_dlq" to "anon";

grant select on table "public"."message_delivery_dlq" to "anon";

grant trigger on table "public"."message_delivery_dlq" to "anon";

grant truncate on table "public"."message_delivery_dlq" to "anon";

grant update on table "public"."message_delivery_dlq" to "anon";

grant delete on table "public"."message_delivery_dlq" to "authenticated";

grant insert on table "public"."message_delivery_dlq" to "authenticated";

grant references on table "public"."message_delivery_dlq" to "authenticated";

grant select on table "public"."message_delivery_dlq" to "authenticated";

grant trigger on table "public"."message_delivery_dlq" to "authenticated";

grant truncate on table "public"."message_delivery_dlq" to "authenticated";

grant update on table "public"."message_delivery_dlq" to "authenticated";

grant delete on table "public"."message_delivery_dlq" to "service_role";

grant insert on table "public"."message_delivery_dlq" to "service_role";

grant references on table "public"."message_delivery_dlq" to "service_role";

grant select on table "public"."message_delivery_dlq" to "service_role";

grant trigger on table "public"."message_delivery_dlq" to "service_role";

grant truncate on table "public"."message_delivery_dlq" to "service_role";

grant update on table "public"."message_delivery_dlq" to "service_role";

grant delete on table "public"."message_delivery_events" to "anon";

grant insert on table "public"."message_delivery_events" to "anon";

grant references on table "public"."message_delivery_events" to "anon";

grant select on table "public"."message_delivery_events" to "anon";

grant trigger on table "public"."message_delivery_events" to "anon";

grant truncate on table "public"."message_delivery_events" to "anon";

grant update on table "public"."message_delivery_events" to "anon";

grant delete on table "public"."message_delivery_events" to "authenticated";

grant insert on table "public"."message_delivery_events" to "authenticated";

grant references on table "public"."message_delivery_events" to "authenticated";

grant select on table "public"."message_delivery_events" to "authenticated";

grant trigger on table "public"."message_delivery_events" to "authenticated";

grant truncate on table "public"."message_delivery_events" to "authenticated";

grant update on table "public"."message_delivery_events" to "authenticated";

grant delete on table "public"."message_delivery_events" to "service_role";

grant insert on table "public"."message_delivery_events" to "service_role";

grant references on table "public"."message_delivery_events" to "service_role";

grant select on table "public"."message_delivery_events" to "service_role";

grant trigger on table "public"."message_delivery_events" to "service_role";

grant truncate on table "public"."message_delivery_events" to "service_role";

grant update on table "public"."message_delivery_events" to "service_role";

grant delete on table "public"."messages" to "anon";

grant insert on table "public"."messages" to "anon";

grant references on table "public"."messages" to "anon";

grant select on table "public"."messages" to "anon";

grant trigger on table "public"."messages" to "anon";

grant truncate on table "public"."messages" to "anon";

grant update on table "public"."messages" to "anon";

grant delete on table "public"."messages" to "authenticated";

grant insert on table "public"."messages" to "authenticated";

grant references on table "public"."messages" to "authenticated";

grant select on table "public"."messages" to "authenticated";

grant trigger on table "public"."messages" to "authenticated";

grant truncate on table "public"."messages" to "authenticated";

grant update on table "public"."messages" to "authenticated";

grant delete on table "public"."messages" to "service_role";

grant insert on table "public"."messages" to "service_role";

grant references on table "public"."messages" to "service_role";

grant select on table "public"."messages" to "service_role";

grant trigger on table "public"."messages" to "service_role";

grant truncate on table "public"."messages" to "service_role";

grant update on table "public"."messages" to "service_role";

grant delete on table "public"."organization_users" to "anon";

grant insert on table "public"."organization_users" to "anon";

grant references on table "public"."organization_users" to "anon";

grant select on table "public"."organization_users" to "anon";

grant trigger on table "public"."organization_users" to "anon";

grant truncate on table "public"."organization_users" to "anon";

grant update on table "public"."organization_users" to "anon";

grant delete on table "public"."organization_users" to "authenticated";

grant insert on table "public"."organization_users" to "authenticated";

grant references on table "public"."organization_users" to "authenticated";

grant select on table "public"."organization_users" to "authenticated";

grant trigger on table "public"."organization_users" to "authenticated";

grant truncate on table "public"."organization_users" to "authenticated";

grant update on table "public"."organization_users" to "authenticated";

grant delete on table "public"."organization_users" to "service_role";

grant insert on table "public"."organization_users" to "service_role";

grant references on table "public"."organization_users" to "service_role";

grant select on table "public"."organization_users" to "service_role";

grant trigger on table "public"."organization_users" to "service_role";

grant truncate on table "public"."organization_users" to "service_role";

grant update on table "public"."organization_users" to "service_role";

grant delete on table "public"."organizations" to "anon";

grant insert on table "public"."organizations" to "anon";

grant references on table "public"."organizations" to "anon";

grant select on table "public"."organizations" to "anon";

grant trigger on table "public"."organizations" to "anon";

grant truncate on table "public"."organizations" to "anon";

grant update on table "public"."organizations" to "anon";

grant delete on table "public"."organizations" to "authenticated";

grant insert on table "public"."organizations" to "authenticated";

grant references on table "public"."organizations" to "authenticated";

grant select on table "public"."organizations" to "authenticated";

grant trigger on table "public"."organizations" to "authenticated";

grant truncate on table "public"."organizations" to "authenticated";

grant update on table "public"."organizations" to "authenticated";

grant delete on table "public"."organizations" to "service_role";

grant insert on table "public"."organizations" to "service_role";

grant references on table "public"."organizations" to "service_role";

grant select on table "public"."organizations" to "service_role";

grant trigger on table "public"."organizations" to "service_role";

grant truncate on table "public"."organizations" to "service_role";

grant update on table "public"."organizations" to "service_role";

grant delete on table "public"."psf_cases" to "anon";

grant insert on table "public"."psf_cases" to "anon";

grant references on table "public"."psf_cases" to "anon";

grant select on table "public"."psf_cases" to "anon";

grant trigger on table "public"."psf_cases" to "anon";

grant truncate on table "public"."psf_cases" to "anon";

grant update on table "public"."psf_cases" to "anon";

grant delete on table "public"."psf_cases" to "authenticated";

grant insert on table "public"."psf_cases" to "authenticated";

grant references on table "public"."psf_cases" to "authenticated";

grant select on table "public"."psf_cases" to "authenticated";

grant trigger on table "public"."psf_cases" to "authenticated";

grant truncate on table "public"."psf_cases" to "authenticated";

grant update on table "public"."psf_cases" to "authenticated";

grant delete on table "public"."psf_cases" to "service_role";

grant insert on table "public"."psf_cases" to "service_role";

grant references on table "public"."psf_cases" to "service_role";

grant select on table "public"."psf_cases" to "service_role";

grant trigger on table "public"."psf_cases" to "service_role";

grant truncate on table "public"."psf_cases" to "service_role";

grant update on table "public"."psf_cases" to "service_role";

grant references on table "public"."razorpay_orders" to "anon";

grant select on table "public"."razorpay_orders" to "anon";

grant trigger on table "public"."razorpay_orders" to "anon";

grant truncate on table "public"."razorpay_orders" to "anon";

grant references on table "public"."razorpay_orders" to "authenticated";

grant select on table "public"."razorpay_orders" to "authenticated";

grant trigger on table "public"."razorpay_orders" to "authenticated";

grant truncate on table "public"."razorpay_orders" to "authenticated";

grant delete on table "public"."razorpay_orders" to "service_role";

grant insert on table "public"."razorpay_orders" to "service_role";

grant references on table "public"."razorpay_orders" to "service_role";

grant select on table "public"."razorpay_orders" to "service_role";

grant trigger on table "public"."razorpay_orders" to "service_role";

grant truncate on table "public"."razorpay_orders" to "service_role";

grant update on table "public"."razorpay_orders" to "service_role";

grant references on table "public"."razorpay_payments" to "anon";

grant select on table "public"."razorpay_payments" to "anon";

grant trigger on table "public"."razorpay_payments" to "anon";

grant truncate on table "public"."razorpay_payments" to "anon";

grant references on table "public"."razorpay_payments" to "authenticated";

grant select on table "public"."razorpay_payments" to "authenticated";

grant trigger on table "public"."razorpay_payments" to "authenticated";

grant truncate on table "public"."razorpay_payments" to "authenticated";

grant delete on table "public"."razorpay_payments" to "service_role";

grant insert on table "public"."razorpay_payments" to "service_role";

grant references on table "public"."razorpay_payments" to "service_role";

grant select on table "public"."razorpay_payments" to "service_role";

grant trigger on table "public"."razorpay_payments" to "service_role";

grant truncate on table "public"."razorpay_payments" to "service_role";

grant update on table "public"."razorpay_payments" to "service_role";

grant delete on table "public"."replay_requests" to "anon";

grant insert on table "public"."replay_requests" to "anon";

grant references on table "public"."replay_requests" to "anon";

grant select on table "public"."replay_requests" to "anon";

grant trigger on table "public"."replay_requests" to "anon";

grant truncate on table "public"."replay_requests" to "anon";

grant update on table "public"."replay_requests" to "anon";

grant delete on table "public"."replay_requests" to "authenticated";

grant insert on table "public"."replay_requests" to "authenticated";

grant references on table "public"."replay_requests" to "authenticated";

grant select on table "public"."replay_requests" to "authenticated";

grant trigger on table "public"."replay_requests" to "authenticated";

grant truncate on table "public"."replay_requests" to "authenticated";

grant update on table "public"."replay_requests" to "authenticated";

grant delete on table "public"."replay_requests" to "service_role";

grant insert on table "public"."replay_requests" to "service_role";

grant references on table "public"."replay_requests" to "service_role";

grant select on table "public"."replay_requests" to "service_role";

grant trigger on table "public"."replay_requests" to "service_role";

grant truncate on table "public"."replay_requests" to "service_role";

grant update on table "public"."replay_requests" to "service_role";

grant delete on table "public"."unanswered_questions" to "anon";

grant insert on table "public"."unanswered_questions" to "anon";

grant references on table "public"."unanswered_questions" to "anon";

grant select on table "public"."unanswered_questions" to "anon";

grant trigger on table "public"."unanswered_questions" to "anon";

grant truncate on table "public"."unanswered_questions" to "anon";

grant update on table "public"."unanswered_questions" to "anon";

grant delete on table "public"."unanswered_questions" to "authenticated";

grant insert on table "public"."unanswered_questions" to "authenticated";

grant references on table "public"."unanswered_questions" to "authenticated";

grant select on table "public"."unanswered_questions" to "authenticated";

grant trigger on table "public"."unanswered_questions" to "authenticated";

grant truncate on table "public"."unanswered_questions" to "authenticated";

grant update on table "public"."unanswered_questions" to "authenticated";

grant delete on table "public"."unanswered_questions" to "service_role";

grant insert on table "public"."unanswered_questions" to "service_role";

grant references on table "public"."unanswered_questions" to "service_role";

grant select on table "public"."unanswered_questions" to "service_role";

grant trigger on table "public"."unanswered_questions" to "service_role";

grant truncate on table "public"."unanswered_questions" to "service_role";

grant update on table "public"."unanswered_questions" to "service_role";

grant delete on table "public"."wallet_alert_logs" to "anon";

grant insert on table "public"."wallet_alert_logs" to "anon";

grant references on table "public"."wallet_alert_logs" to "anon";

grant select on table "public"."wallet_alert_logs" to "anon";

grant trigger on table "public"."wallet_alert_logs" to "anon";

grant truncate on table "public"."wallet_alert_logs" to "anon";

grant update on table "public"."wallet_alert_logs" to "anon";

grant delete on table "public"."wallet_alert_logs" to "authenticated";

grant insert on table "public"."wallet_alert_logs" to "authenticated";

grant references on table "public"."wallet_alert_logs" to "authenticated";

grant select on table "public"."wallet_alert_logs" to "authenticated";

grant trigger on table "public"."wallet_alert_logs" to "authenticated";

grant truncate on table "public"."wallet_alert_logs" to "authenticated";

grant update on table "public"."wallet_alert_logs" to "authenticated";

grant delete on table "public"."wallet_alert_logs" to "service_role";

grant insert on table "public"."wallet_alert_logs" to "service_role";

grant references on table "public"."wallet_alert_logs" to "service_role";

grant select on table "public"."wallet_alert_logs" to "service_role";

grant trigger on table "public"."wallet_alert_logs" to "service_role";

grant truncate on table "public"."wallet_alert_logs" to "service_role";

grant update on table "public"."wallet_alert_logs" to "service_role";

grant delete on table "public"."wallet_transactions" to "anon";

grant insert on table "public"."wallet_transactions" to "anon";

grant references on table "public"."wallet_transactions" to "anon";

grant select on table "public"."wallet_transactions" to "anon";

grant trigger on table "public"."wallet_transactions" to "anon";

grant truncate on table "public"."wallet_transactions" to "anon";

grant update on table "public"."wallet_transactions" to "anon";

grant delete on table "public"."wallet_transactions" to "authenticated";

grant insert on table "public"."wallet_transactions" to "authenticated";

grant references on table "public"."wallet_transactions" to "authenticated";

grant select on table "public"."wallet_transactions" to "authenticated";

grant trigger on table "public"."wallet_transactions" to "authenticated";

grant truncate on table "public"."wallet_transactions" to "authenticated";

grant update on table "public"."wallet_transactions" to "authenticated";

grant delete on table "public"."wallet_transactions" to "service_role";

grant insert on table "public"."wallet_transactions" to "service_role";

grant references on table "public"."wallet_transactions" to "service_role";

grant select on table "public"."wallet_transactions" to "service_role";

grant trigger on table "public"."wallet_transactions" to "service_role";

grant truncate on table "public"."wallet_transactions" to "service_role";

grant update on table "public"."wallet_transactions" to "service_role";

grant delete on table "public"."wallets" to "anon";

grant insert on table "public"."wallets" to "anon";

grant references on table "public"."wallets" to "anon";

grant select on table "public"."wallets" to "anon";

grant trigger on table "public"."wallets" to "anon";

grant truncate on table "public"."wallets" to "anon";

grant update on table "public"."wallets" to "anon";

grant delete on table "public"."wallets" to "authenticated";

grant insert on table "public"."wallets" to "authenticated";

grant references on table "public"."wallets" to "authenticated";

grant select on table "public"."wallets" to "authenticated";

grant trigger on table "public"."wallets" to "authenticated";

grant truncate on table "public"."wallets" to "authenticated";

grant update on table "public"."wallets" to "authenticated";

grant delete on table "public"."wallets" to "service_role";

grant insert on table "public"."wallets" to "service_role";

grant references on table "public"."wallets" to "service_role";

grant select on table "public"."wallets" to "service_role";

grant trigger on table "public"."wallets" to "service_role";

grant truncate on table "public"."wallets" to "service_role";

grant update on table "public"."wallets" to "service_role";

grant delete on table "public"."whatsapp_bulk_logs" to "anon";

grant insert on table "public"."whatsapp_bulk_logs" to "anon";

grant references on table "public"."whatsapp_bulk_logs" to "anon";

grant select on table "public"."whatsapp_bulk_logs" to "anon";

grant trigger on table "public"."whatsapp_bulk_logs" to "anon";

grant truncate on table "public"."whatsapp_bulk_logs" to "anon";

grant update on table "public"."whatsapp_bulk_logs" to "anon";

grant delete on table "public"."whatsapp_bulk_logs" to "authenticated";

grant insert on table "public"."whatsapp_bulk_logs" to "authenticated";

grant references on table "public"."whatsapp_bulk_logs" to "authenticated";

grant select on table "public"."whatsapp_bulk_logs" to "authenticated";

grant trigger on table "public"."whatsapp_bulk_logs" to "authenticated";

grant truncate on table "public"."whatsapp_bulk_logs" to "authenticated";

grant update on table "public"."whatsapp_bulk_logs" to "authenticated";

grant delete on table "public"."whatsapp_bulk_logs" to "service_role";

grant insert on table "public"."whatsapp_bulk_logs" to "service_role";

grant references on table "public"."whatsapp_bulk_logs" to "service_role";

grant select on table "public"."whatsapp_bulk_logs" to "service_role";

grant trigger on table "public"."whatsapp_bulk_logs" to "service_role";

grant truncate on table "public"."whatsapp_bulk_logs" to "service_role";

grant update on table "public"."whatsapp_bulk_logs" to "service_role";

grant delete on table "public"."whatsapp_settings" to "anon";

grant insert on table "public"."whatsapp_settings" to "anon";

grant references on table "public"."whatsapp_settings" to "anon";

grant select on table "public"."whatsapp_settings" to "anon";

grant trigger on table "public"."whatsapp_settings" to "anon";

grant truncate on table "public"."whatsapp_settings" to "anon";

grant update on table "public"."whatsapp_settings" to "anon";

grant delete on table "public"."whatsapp_settings" to "authenticated";

grant insert on table "public"."whatsapp_settings" to "authenticated";

grant references on table "public"."whatsapp_settings" to "authenticated";

grant select on table "public"."whatsapp_settings" to "authenticated";

grant trigger on table "public"."whatsapp_settings" to "authenticated";

grant truncate on table "public"."whatsapp_settings" to "authenticated";

grant update on table "public"."whatsapp_settings" to "authenticated";

grant delete on table "public"."whatsapp_settings" to "service_role";

grant insert on table "public"."whatsapp_settings" to "service_role";

grant references on table "public"."whatsapp_settings" to "service_role";

grant select on table "public"."whatsapp_settings" to "service_role";

grant trigger on table "public"."whatsapp_settings" to "service_role";

grant truncate on table "public"."whatsapp_settings" to "service_role";

grant update on table "public"."whatsapp_settings" to "service_role";

grant delete on table "public"."whatsapp_templates" to "anon";

grant insert on table "public"."whatsapp_templates" to "anon";

grant references on table "public"."whatsapp_templates" to "anon";

grant select on table "public"."whatsapp_templates" to "anon";

grant trigger on table "public"."whatsapp_templates" to "anon";

grant truncate on table "public"."whatsapp_templates" to "anon";

grant update on table "public"."whatsapp_templates" to "anon";

grant delete on table "public"."whatsapp_templates" to "authenticated";

grant insert on table "public"."whatsapp_templates" to "authenticated";

grant references on table "public"."whatsapp_templates" to "authenticated";

grant select on table "public"."whatsapp_templates" to "authenticated";

grant trigger on table "public"."whatsapp_templates" to "authenticated";

grant truncate on table "public"."whatsapp_templates" to "authenticated";

grant update on table "public"."whatsapp_templates" to "authenticated";

grant delete on table "public"."whatsapp_templates" to "service_role";

grant insert on table "public"."whatsapp_templates" to "service_role";

grant references on table "public"."whatsapp_templates" to "service_role";

grant select on table "public"."whatsapp_templates" to "service_role";

grant trigger on table "public"."whatsapp_templates" to "service_role";

grant truncate on table "public"."whatsapp_templates" to "service_role";

grant update on table "public"."whatsapp_templates" to "service_role";

grant delete on table "public"."workflow_logs" to "anon";

grant insert on table "public"."workflow_logs" to "anon";

grant references on table "public"."workflow_logs" to "anon";

grant select on table "public"."workflow_logs" to "anon";

grant trigger on table "public"."workflow_logs" to "anon";

grant truncate on table "public"."workflow_logs" to "anon";

grant update on table "public"."workflow_logs" to "anon";

grant delete on table "public"."workflow_logs" to "authenticated";

grant insert on table "public"."workflow_logs" to "authenticated";

grant references on table "public"."workflow_logs" to "authenticated";

grant select on table "public"."workflow_logs" to "authenticated";

grant trigger on table "public"."workflow_logs" to "authenticated";

grant truncate on table "public"."workflow_logs" to "authenticated";

grant update on table "public"."workflow_logs" to "authenticated";

grant delete on table "public"."workflow_logs" to "service_role";

grant insert on table "public"."workflow_logs" to "service_role";

grant references on table "public"."workflow_logs" to "service_role";

grant select on table "public"."workflow_logs" to "service_role";

grant trigger on table "public"."workflow_logs" to "service_role";

grant truncate on table "public"."workflow_logs" to "service_role";

grant update on table "public"."workflow_logs" to "service_role";

grant delete on table "public"."workflow_steps" to "anon";

grant insert on table "public"."workflow_steps" to "anon";

grant references on table "public"."workflow_steps" to "anon";

grant select on table "public"."workflow_steps" to "anon";

grant trigger on table "public"."workflow_steps" to "anon";

grant truncate on table "public"."workflow_steps" to "anon";

grant update on table "public"."workflow_steps" to "anon";

grant delete on table "public"."workflow_steps" to "authenticated";

grant insert on table "public"."workflow_steps" to "authenticated";

grant references on table "public"."workflow_steps" to "authenticated";

grant select on table "public"."workflow_steps" to "authenticated";

grant trigger on table "public"."workflow_steps" to "authenticated";

grant truncate on table "public"."workflow_steps" to "authenticated";

grant update on table "public"."workflow_steps" to "authenticated";

grant delete on table "public"."workflow_steps" to "service_role";

grant insert on table "public"."workflow_steps" to "service_role";

grant references on table "public"."workflow_steps" to "service_role";

grant select on table "public"."workflow_steps" to "service_role";

grant trigger on table "public"."workflow_steps" to "service_role";

grant truncate on table "public"."workflow_steps" to "service_role";

grant update on table "public"."workflow_steps" to "service_role";

grant delete on table "public"."workflows" to "anon";

grant insert on table "public"."workflows" to "anon";

grant references on table "public"."workflows" to "anon";

grant select on table "public"."workflows" to "anon";

grant trigger on table "public"."workflows" to "anon";

grant truncate on table "public"."workflows" to "anon";

grant update on table "public"."workflows" to "anon";

grant delete on table "public"."workflows" to "authenticated";

grant insert on table "public"."workflows" to "authenticated";

grant references on table "public"."workflows" to "authenticated";

grant select on table "public"."workflows" to "authenticated";

grant trigger on table "public"."workflows" to "authenticated";

grant truncate on table "public"."workflows" to "authenticated";

grant update on table "public"."workflows" to "authenticated";

grant delete on table "public"."workflows" to "service_role";

grant insert on table "public"."workflows" to "service_role";

grant references on table "public"."workflows" to "service_role";

grant select on table "public"."workflows" to "service_role";

grant trigger on table "public"."workflows" to "service_role";

grant truncate on table "public"."workflows" to "service_role";

grant update on table "public"."workflows" to "service_role";


  create policy "ai_embeddings_cache_service_only"
  on "public"."ai_embeddings_cache"
  as permissive
  for all
  to public
using ((auth.role() = 'service_role'::text))
with check ((auth.role() = 'service_role'::text));



  create policy "ai_org_rate_limit_usage_service_only"
  on "public"."ai_org_rate_limit_usage"
  as permissive
  for all
  to public
using ((auth.role() = 'service_role'::text))
with check ((auth.role() = 'service_role'::text));



  create policy "ai_org_rate_limits_read_org"
  on "public"."ai_org_rate_limits"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = ai_org_rate_limits.organization_id)))));



  create policy "ai_org_rate_limits_write_service_only"
  on "public"."ai_org_rate_limits"
  as permissive
  for all
  to public
using ((auth.role() = 'service_role'::text))
with check ((auth.role() = 'service_role'::text));



  create policy "ai_settings_members_all"
  on "public"."ai_settings"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = ai_settings.organization_id)))))
with check ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = ai_settings.organization_id)))));



  create policy "ai_turn_traces_read_org"
  on "public"."ai_turn_traces"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = ai_turn_traces.organization_id)))));



  create policy "ai_turn_traces_write_service_only"
  on "public"."ai_turn_traces"
  as permissive
  for all
  to public
using ((auth.role() = 'service_role'::text))
with check ((auth.role() = 'service_role'::text));



  create policy "ai_usage_logs_members_read"
  on "public"."ai_usage_logs"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = ai_usage_logs.organization_id)))));



  create policy "audit_logs_insert_service_role"
  on "public"."audit_logs"
  as permissive
  for insert
  to public
with check ((auth.role() = 'service_role'::text));



  create policy "audit_logs_read_org"
  on "public"."audit_logs"
  as permissive
  for select
  to public
using ((organization_id IN ( SELECT organization_users.organization_id
   FROM public.organization_users
  WHERE (organization_users.user_id = auth.uid()))));



  create policy "background_jobs_service_only"
  on "public"."background_jobs"
  as permissive
  for all
  to public
using ((auth.role() = 'service_role'::text))
with check ((auth.role() = 'service_role'::text));



  create policy "Allow insert instructions"
  on "public"."bot_instructions"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = bot_instructions.organization_id)))));



  create policy "Allow select instructions"
  on "public"."bot_instructions"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = bot_instructions.organization_id)))));



  create policy "Allow update instructions"
  on "public"."bot_instructions"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = bot_instructions.organization_id)))))
with check ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = bot_instructions.organization_id)))));



  create policy "bot_instructions_mod_service_role_only"
  on "public"."bot_instructions"
  as permissive
  for all
  to public
using ((auth.role() = 'service_role'::text))
with check ((auth.role() = 'service_role'::text));



  create policy "bot_instructions_org_access"
  on "public"."bot_instructions"
  as permissive
  for all
  to public
using ((organization_id = ((auth.jwt() ->> 'organization_id'::text))::uuid));



  create policy "org_members_manage_bot_instructions"
  on "public"."bot_instructions"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = bot_instructions.organization_id) AND (ou.user_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = bot_instructions.organization_id) AND (ou.user_id = auth.uid())))));



  create policy "Allow insert personality"
  on "public"."bot_personality"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = bot_personality.organization_id)))));



  create policy "Allow select personality"
  on "public"."bot_personality"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = bot_personality.organization_id)))));



  create policy "Allow update personality"
  on "public"."bot_personality"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = bot_personality.organization_id)))))
with check ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = bot_personality.organization_id)))));



  create policy "bot_personality_mod_service_role_only"
  on "public"."bot_personality"
  as permissive
  for all
  to public
using ((auth.role() = 'service_role'::text))
with check ((auth.role() = 'service_role'::text));



  create policy "bot_personality_org_access"
  on "public"."bot_personality"
  as permissive
  for all
  to public
using ((organization_id = ((auth.jwt() ->> 'organization_id'::text))::uuid));



  create policy "org_admin_update_bot_personality"
  on "public"."bot_personality"
  as permissive
  for update
  to public
using ((organization_id IN ( SELECT organization_users.organization_id
   FROM public.organization_users
  WHERE ((organization_users.user_id = auth.uid()) AND ((organization_users.role = ANY (ARRAY['owner'::text, 'admin'::text])) OR (organization_users.is_primary = true))))))
with check ((organization_id IN ( SELECT organization_users.organization_id
   FROM public.organization_users
  WHERE ((organization_users.user_id = auth.uid()) AND ((organization_users.role = ANY (ARRAY['owner'::text, 'admin'::text])) OR (organization_users.is_primary = true))))));



  create policy "org_members_manage_bot_personality"
  on "public"."bot_personality"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = bot_personality.organization_id) AND (ou.user_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = bot_personality.organization_id) AND (ou.user_id = auth.uid())))));



  create policy "org_members_modify_bot_personality"
  on "public"."bot_personality"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = bot_personality.organization_id) AND (ou.user_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = bot_personality.organization_id) AND (ou.user_id = auth.uid())))));



  create policy "org_members_select_bot_personality"
  on "public"."bot_personality"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = bot_personality.organization_id) AND (ou.user_id = auth.uid())))));



  create policy "campaign_delivery_import_service_role_all"
  on "public"."campaign_delivery_import"
  as permissive
  for all
  to service_role
using (true)
with check (true);



  create policy "cdrf_select_org"
  on "public"."campaign_delivery_receipt_failures"
  as permissive
  for select
  to authenticated
using ((organization_id IN ( SELECT ou.organization_id
   FROM public.organization_users ou
  WHERE (ou.user_id = auth.uid()))));



  create policy "cdrf_service_role_all"
  on "public"."campaign_delivery_receipt_failures"
  as permissive
  for all
  to service_role
using (true)
with check (true);



  create policy "campaign_messages_members_all"
  on "public"."campaign_messages"
  as permissive
  for all
  to public
using (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = campaign_messages.organization_id))))))
with check (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = campaign_messages.organization_id))))));



  create policy "org_members_can_manage_campaign_messages"
  on "public"."campaign_messages"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = campaign_messages.organization_id) AND (ou.user_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = campaign_messages.organization_id) AND (ou.user_id = auth.uid())))));



  create policy "org_members_modify_campaign_messages"
  on "public"."campaign_messages"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM (public.campaigns c
     JOIN public.organization_users ou ON ((ou.organization_id = c.organization_id)))
  WHERE ((c.id = campaign_messages.campaign_id) AND (ou.user_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM (public.campaigns c
     JOIN public.organization_users ou ON ((ou.organization_id = c.organization_id)))
  WHERE ((c.id = campaign_messages.campaign_id) AND (ou.user_id = auth.uid())))));



  create policy "org_members_select_campaign_messages"
  on "public"."campaign_messages"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM (public.campaigns c
     JOIN public.organization_users ou ON ((ou.organization_id = c.organization_id)))
  WHERE ((c.id = campaign_messages.campaign_id) AND (ou.user_id = auth.uid())))));



  create policy "campaigns_members_all"
  on "public"."campaigns"
  as permissive
  for all
  to public
using (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = campaigns.organization_id))))))
with check (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = campaigns.organization_id))))));



  create policy "org_members_can_manage_campaigns"
  on "public"."campaigns"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = campaigns.organization_id) AND (ou.user_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = campaigns.organization_id) AND (ou.user_id = auth.uid())))));



  create policy "org_members_modify_campaigns"
  on "public"."campaigns"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = campaigns.organization_id) AND (ou.user_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = campaigns.organization_id) AND (ou.user_id = auth.uid())))));



  create policy "org_members_select_campaigns"
  on "public"."campaigns"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = campaigns.organization_id) AND (ou.user_id = auth.uid())))));



  create policy "contact_uploads_members_all"
  on "public"."contact_uploads"
  as permissive
  for all
  to authenticated
using ((organization_id IN ( SELECT ou.organization_id
   FROM public.organization_users ou
  WHERE (ou.user_id = auth.uid()))))
with check ((organization_id IN ( SELECT ou.organization_id
   FROM public.organization_users ou
  WHERE (ou.user_id = auth.uid()))));



  create policy "contact_uploads_service_role_all"
  on "public"."contact_uploads"
  as permissive
  for all
  to service_role
using (true)
with check (true);



  create policy "contacts_delete_org_members"
  on "public"."contacts"
  as permissive
  for delete
  to public
using (((auth.role() = 'service_role'::text) OR (organization_id IN ( SELECT ou.organization_id
   FROM public.organization_users ou
  WHERE (ou.user_id = auth.uid())))));



  create policy "contacts_insert_org_members"
  on "public"."contacts"
  as permissive
  for insert
  to public
with check (((auth.role() = 'service_role'::text) OR (organization_id IN ( SELECT ou.organization_id
   FROM public.organization_users ou
  WHERE (ou.user_id = auth.uid())))));



  create policy "contacts_members_all"
  on "public"."contacts"
  as permissive
  for all
  to public
using (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = contacts.organization_id))))))
with check (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = contacts.organization_id))))));



  create policy "contacts_select_org_members"
  on "public"."contacts"
  as permissive
  for select
  to public
using (((auth.role() = 'service_role'::text) OR (organization_id IN ( SELECT ou.organization_id
   FROM public.organization_users ou
  WHERE (ou.user_id = auth.uid())))));



  create policy "contacts_update_org_members"
  on "public"."contacts"
  as permissive
  for update
  to public
using (((auth.role() = 'service_role'::text) OR (organization_id IN ( SELECT ou.organization_id
   FROM public.organization_users ou
  WHERE (ou.user_id = auth.uid())))))
with check (((auth.role() = 'service_role'::text) OR (organization_id IN ( SELECT ou.organization_id
   FROM public.organization_users ou
  WHERE (ou.user_id = auth.uid())))));



  create policy "org_members_manage_contacts"
  on "public"."contacts"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = contacts.organization_id) AND (ou.user_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = contacts.organization_id) AND (ou.user_id = auth.uid())))));



  create policy "org_members_modify_contacts"
  on "public"."contacts"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = contacts.organization_id) AND (ou.user_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = contacts.organization_id) AND (ou.user_id = auth.uid())))));



  create policy "org_members_select_contacts"
  on "public"."contacts"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = contacts.organization_id) AND (ou.user_id = auth.uid())))));



  create policy "conversation_state_select_org"
  on "public"."conversation_state"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM (public.conversations conv
     JOIN public.organization_users ou ON ((ou.organization_id = conv.organization_id)))
  WHERE ((conv.id = conversation_state.conversation_id) AND (ou.user_id = auth.uid())))));



  create policy "conversation_state_write_service_role"
  on "public"."conversation_state"
  as permissive
  for all
  to service_role
using (true)
with check (true);



  create policy "conversations_members_all"
  on "public"."conversations"
  as permissive
  for all
  to public
using (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = conversations.organization_id))))))
with check (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = conversations.organization_id))))));



  create policy "org_members_manage_conversations"
  on "public"."conversations"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = conversations.organization_id) AND (ou.user_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = conversations.organization_id) AND (ou.user_id = auth.uid())))));



  create policy "org_members_modify_conversations"
  on "public"."conversations"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = conversations.organization_id) AND (ou.user_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = conversations.organization_id) AND (ou.user_id = auth.uid())))));



  create policy "org_members_select_conversations"
  on "public"."conversations"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = conversations.organization_id) AND (ou.user_id = auth.uid())))));



  create policy "knowledge_articles_members_all"
  on "public"."knowledge_articles"
  as permissive
  for all
  to public
using (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = knowledge_articles.organization_id))))))
with check (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = knowledge_articles.organization_id))))));



  create policy "org_members_manage_knowledge_articles"
  on "public"."knowledge_articles"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = knowledge_articles.organization_id) AND (ou.user_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = knowledge_articles.organization_id) AND (ou.user_id = auth.uid())))));



  create policy "org_members_modify_kb_articles"
  on "public"."knowledge_articles"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = knowledge_articles.organization_id) AND (ou.user_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = knowledge_articles.organization_id) AND (ou.user_id = auth.uid())))));



  create policy "org_members_select_kb_articles"
  on "public"."knowledge_articles"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = knowledge_articles.organization_id) AND (ou.user_id = auth.uid())))));



  create policy "service role read"
  on "public"."knowledge_articles"
  as permissive
  for select
  to service_role
using (true);



  create policy "knowledge_chunks_select_members"
  on "public"."knowledge_chunks"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = knowledge_chunks.organization_id) AND (ou.user_id = auth.uid())))));



  create policy "service role can manage knowledge chunks"
  on "public"."knowledge_chunks"
  as permissive
  for all
  to service_role
using (true)
with check (true);



  create policy "service_role_kb_chunks"
  on "public"."knowledge_chunks"
  as permissive
  for all
  to service_role
using (true)
with check (true);



  create policy "message_delivery_dlq_service_only"
  on "public"."message_delivery_dlq"
  as permissive
  for all
  to public
using ((auth.role() = 'service_role'::text))
with check ((auth.role() = 'service_role'::text));



  create policy "message_delivery_events_read_org"
  on "public"."message_delivery_events"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = message_delivery_events.organization_id)))));



  create policy "message_delivery_events_write_service_only"
  on "public"."message_delivery_events"
  as permissive
  for all
  to public
using ((auth.role() = 'service_role'::text))
with check ((auth.role() = 'service_role'::text));



  create policy "messages_members_all"
  on "public"."messages"
  as permissive
  for all
  to public
using (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM (public.conversations c
     JOIN public.organization_users ou ON ((ou.organization_id = c.organization_id)))
  WHERE ((c.id = messages.conversation_id) AND (ou.user_id = auth.uid()))))))
with check (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM (public.conversations c
     JOIN public.organization_users ou ON ((ou.organization_id = c.organization_id)))
  WHERE ((c.id = messages.conversation_id) AND (ou.user_id = auth.uid()))))));



  create policy "org_members_manage_messages"
  on "public"."messages"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM (public.conversations c
     JOIN public.organization_users ou ON ((ou.organization_id = c.organization_id)))
  WHERE ((c.id = messages.conversation_id) AND (ou.user_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM (public.conversations c
     JOIN public.organization_users ou ON ((ou.organization_id = c.organization_id)))
  WHERE ((c.id = messages.conversation_id) AND (ou.user_id = auth.uid())))));



  create policy "org_members_modify_messages"
  on "public"."messages"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM (public.conversations c
     JOIN public.organization_users ou ON ((ou.organization_id = c.organization_id)))
  WHERE ((c.id = messages.conversation_id) AND (ou.user_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM (public.conversations c
     JOIN public.organization_users ou ON ((ou.organization_id = c.organization_id)))
  WHERE ((c.id = messages.conversation_id) AND (ou.user_id = auth.uid())))));



  create policy "org_members_select_messages"
  on "public"."messages"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM (public.conversations c
     JOIN public.organization_users ou ON ((ou.organization_id = c.organization_id)))
  WHERE ((c.id = messages.conversation_id) AND (ou.user_id = auth.uid())))));



  create policy "org_users_mod_service_role_only"
  on "public"."organization_users"
  as permissive
  for all
  to public
using ((auth.role() = 'service_role'::text))
with check ((auth.role() = 'service_role'::text));



  create policy "org_users_select_self"
  on "public"."organization_users"
  as permissive
  for select
  to public
using (((auth.role() = 'service_role'::text) OR (user_id = auth.uid())));



  create policy "user_delete_own_org_membership"
  on "public"."organization_users"
  as permissive
  for delete
  to public
using ((user_id = auth.uid()));



  create policy "user_insert_own_org_membership"
  on "public"."organization_users"
  as permissive
  for insert
  to public
with check ((user_id = auth.uid()));



  create policy "user_select_own_org_membership"
  on "public"."organization_users"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));



  create policy "user_update_own_org_membership"
  on "public"."organization_users"
  as permissive
  for update
  to public
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));



  create policy "org_admin_update"
  on "public"."organizations"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users
  WHERE ((organization_users.organization_id = organizations.id) AND (organization_users.user_id = auth.uid()) AND (organization_users.role = 'admin'::text)))));



  create policy "org_members_select_organizations"
  on "public"."organizations"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = organizations.id) AND (ou.user_id = auth.uid())))));



  create policy "org_mod_service_role_only"
  on "public"."organizations"
  as permissive
  for all
  to public
using ((auth.role() = 'service_role'::text))
with check ((auth.role() = 'service_role'::text));



  create policy "org_select_visible_to_members"
  on "public"."organizations"
  as permissive
  for select
  to public
using (((auth.role() = 'service_role'::text) OR (id IN ( SELECT ou.organization_id
   FROM public.organization_users ou
  WHERE (ou.user_id = auth.uid())))));



  create policy "psf insert org"
  on "public"."psf_cases"
  as permissive
  for insert
  to public
with check ((organization_id IN ( SELECT organization_users.organization_id
   FROM public.organization_users
  WHERE (organization_users.user_id = auth.uid()))));



  create policy "psf read org"
  on "public"."psf_cases"
  as permissive
  for select
  to public
using ((organization_id IN ( SELECT organization_users.organization_id
   FROM public.organization_users
  WHERE (organization_users.user_id = auth.uid()))));



  create policy "psf update org"
  on "public"."psf_cases"
  as permissive
  for update
  to public
using ((organization_id IN ( SELECT organization_users.organization_id
   FROM public.organization_users
  WHERE (organization_users.user_id = auth.uid()))))
with check ((organization_id IN ( SELECT organization_users.organization_id
   FROM public.organization_users
  WHERE (organization_users.user_id = auth.uid()))));



  create policy "psf_cases_org_access"
  on "public"."psf_cases"
  as permissive
  for all
  to public
using ((organization_id = ((auth.jwt() ->> 'organization_id'::text))::uuid));



  create policy "psf_cases_org_read"
  on "public"."psf_cases"
  as permissive
  for select
  to public
using ((organization_id IN ( SELECT organization_users.organization_id
   FROM public.organization_users
  WHERE (organization_users.user_id = auth.uid()))));



  create policy "psf_cases_org_write"
  on "public"."psf_cases"
  as permissive
  for update
  to public
using ((organization_id IN ( SELECT organization_users.organization_id
   FROM public.organization_users
  WHERE (organization_users.user_id = auth.uid()))));



  create policy "org_members_read_razorpay_orders"
  on "public"."razorpay_orders"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = razorpay_orders.organization_id) AND (ou.user_id = auth.uid())))));



  create policy "org_members_read_razorpay_payments"
  on "public"."razorpay_payments"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = razorpay_payments.organization_id) AND (ou.user_id = auth.uid())))));



  create policy "replay_requests_insert_org"
  on "public"."replay_requests"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = replay_requests.organization_id)))));



  create policy "replay_requests_read_org"
  on "public"."replay_requests"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = replay_requests.organization_id)))));



  create policy "replay_requests_update_service_only"
  on "public"."replay_requests"
  as permissive
  for update
  to public
using ((auth.role() = 'service_role'::text))
with check ((auth.role() = 'service_role'::text));



  create policy "org_members_manage_unanswered_questions"
  on "public"."unanswered_questions"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = unanswered_questions.organization_id) AND (ou.user_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = unanswered_questions.organization_id) AND (ou.user_id = auth.uid())))));



  create policy "org_members_modify_unanswered"
  on "public"."unanswered_questions"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = unanswered_questions.organization_id) AND (ou.user_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = unanswered_questions.organization_id) AND (ou.user_id = auth.uid())))));



  create policy "org_members_select_unanswered"
  on "public"."unanswered_questions"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = unanswered_questions.organization_id) AND (ou.user_id = auth.uid())))));



  create policy "unanswered_questions_org_access"
  on "public"."unanswered_questions"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.conversations c
  WHERE ((c.id = unanswered_questions.conversation_id) AND (c.organization_id = ((auth.jwt() ->> 'organization_id'::text))::uuid)))));



  create policy "wallet_alert_logs_org_access"
  on "public"."wallet_alert_logs"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.wallets w
  WHERE ((w.id = wallet_alert_logs.wallet_id) AND (w.organization_id = ((auth.jwt() ->> 'organization_id'::text))::uuid)))));



  create policy "wallet_alert_logs_select_org"
  on "public"."wallet_alert_logs"
  as permissive
  for select
  to authenticated
using ((organization_id IN ( SELECT ou.organization_id
   FROM public.organization_users ou
  WHERE (ou.user_id = auth.uid()))));



  create policy "wallet_alert_logs_update_org"
  on "public"."wallet_alert_logs"
  as permissive
  for update
  to authenticated
using ((organization_id IN ( SELECT ou.organization_id
   FROM public.organization_users ou
  WHERE (ou.user_id = auth.uid()))))
with check ((organization_id IN ( SELECT ou.organization_id
   FROM public.organization_users ou
  WHERE (ou.user_id = auth.uid()))));



  create policy "wallet_alert_logs_write_service_role"
  on "public"."wallet_alert_logs"
  as permissive
  for all
  to service_role
using (true)
with check (true);



  create policy "service_role_insert_wallet_txn"
  on "public"."wallet_transactions"
  as permissive
  for insert
  to public
with check (true);



  create policy "wallet_transactions_read"
  on "public"."wallet_transactions"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM (public.wallets w
     JOIN public.organization_users ou ON ((ou.organization_id = w.organization_id)))
  WHERE ((w.id = wallet_transactions.wallet_id) AND (ou.user_id = auth.uid())))));



  create policy "wallets_members_read"
  on "public"."wallets"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = wallets.organization_id)))));



  create policy "wallets_read"
  on "public"."wallets"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = wallets.organization_id) AND (ou.user_id = auth.uid())))));



  create policy "whatsapp_bulk_logs_select_org"
  on "public"."whatsapp_bulk_logs"
  as permissive
  for select
  to authenticated
using ((organization_id IN ( SELECT ou.organization_id
   FROM public.organization_users ou
  WHERE (ou.user_id = auth.uid()))));



  create policy "whatsapp_bulk_logs_write_service_role"
  on "public"."whatsapp_bulk_logs"
  as permissive
  for all
  to service_role
using (true)
with check (true);



  create policy "org_members_manage_whatsapp_settings"
  on "public"."whatsapp_settings"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = whatsapp_settings.organization_id) AND (ou.user_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = whatsapp_settings.organization_id) AND (ou.user_id = auth.uid())))));



  create policy "org_members_modify_wa_settings"
  on "public"."whatsapp_settings"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = whatsapp_settings.organization_id) AND (ou.user_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = whatsapp_settings.organization_id) AND (ou.user_id = auth.uid())))));



  create policy "org_members_select_wa_settings"
  on "public"."whatsapp_settings"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = whatsapp_settings.organization_id) AND (ou.user_id = auth.uid())))));



  create policy "wa_settings_mod_service_role_only"
  on "public"."whatsapp_settings"
  as permissive
  for all
  to public
using ((auth.role() = 'service_role'::text))
with check ((auth.role() = 'service_role'::text));



  create policy "whatsapp_settings_members_all"
  on "public"."whatsapp_settings"
  as permissive
  for all
  to public
using (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = whatsapp_settings.organization_id))))))
with check (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = whatsapp_settings.organization_id))))));



  create policy "org_members_select_whatsapp_templates"
  on "public"."whatsapp_templates"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = whatsapp_templates.organization_id) AND (ou.user_id = auth.uid())))));



  create policy "whatsapp_templates_members_all"
  on "public"."whatsapp_templates"
  as permissive
  for all
  to public
using (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = whatsapp_templates.organization_id))))))
with check (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = whatsapp_templates.organization_id))))));



  create policy "org_members_manage_workflow_logs"
  on "public"."workflow_logs"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM (public.workflows w
     JOIN public.organization_users ou ON ((ou.organization_id = w.organization_id)))
  WHERE ((w.id = workflow_logs.workflow_id) AND (ou.user_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM (public.workflows w
     JOIN public.organization_users ou ON ((ou.organization_id = w.organization_id)))
  WHERE ((w.id = workflow_logs.workflow_id) AND (ou.user_id = auth.uid())))));



  create policy "workflow_logs_members_all"
  on "public"."workflow_logs"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM (public.workflows w
     JOIN public.organization_users ou ON ((ou.organization_id = w.organization_id)))
  WHERE ((w.id = workflow_logs.workflow_id) AND (ou.user_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM (public.workflows w
     JOIN public.organization_users ou ON ((ou.organization_id = w.organization_id)))
  WHERE ((w.id = workflow_logs.workflow_id) AND (ou.user_id = auth.uid())))));



  create policy "org_members_manage_workflow_steps"
  on "public"."workflow_steps"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM (public.workflows w
     JOIN public.organization_users ou ON ((ou.organization_id = w.organization_id)))
  WHERE ((w.id = workflow_steps.workflow_id) AND (ou.user_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM (public.workflows w
     JOIN public.organization_users ou ON ((ou.organization_id = w.organization_id)))
  WHERE ((w.id = workflow_steps.workflow_id) AND (ou.user_id = auth.uid())))));



  create policy "workflow_steps_members_all"
  on "public"."workflow_steps"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM (public.workflows w
     JOIN public.organization_users ou ON ((ou.organization_id = w.organization_id)))
  WHERE ((w.id = workflow_steps.workflow_id) AND (ou.user_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM (public.workflows w
     JOIN public.organization_users ou ON ((ou.organization_id = w.organization_id)))
  WHERE ((w.id = workflow_steps.workflow_id) AND (ou.user_id = auth.uid())))));



  create policy "org_members_manage_workflows"
  on "public"."workflows"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = workflows.organization_id) AND (ou.user_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = workflows.organization_id) AND (ou.user_id = auth.uid())))));



  create policy "org_members_modify_workflows"
  on "public"."workflows"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = workflows.organization_id) AND (ou.user_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = workflows.organization_id) AND (ou.user_id = auth.uid())))));



  create policy "org_members_select_workflows"
  on "public"."workflows"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.organization_id = workflows.organization_id) AND (ou.user_id = auth.uid())))));



  create policy "workflows_members_all"
  on "public"."workflows"
  as permissive
  for all
  to public
using (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = workflows.organization_id))))))
with check (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND (ou.organization_id = workflows.organization_id))))));


CREATE TRIGGER trg_create_psf_case AFTER INSERT ON public.campaign_messages FOR EACH ROW EXECUTE FUNCTION public.create_psf_case_on_campaign_message();

CREATE TRIGGER trg_messages_set_order_at BEFORE INSERT OR UPDATE OF wa_received_at, sent_at, created_at ON public.messages FOR EACH ROW EXECUTE FUNCTION public.set_message_order_at();

CREATE TRIGGER trg_set_message_organization_id BEFORE INSERT OR UPDATE OF conversation_id, organization_id ON public.messages FOR EACH ROW EXECUTE FUNCTION public.set_message_organization_id();

CREATE TRIGGER trg_phase5_create_wallet_for_org AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.phase5_create_wallet_for_org();

CREATE TRIGGER trg_psf_cases_updated_at BEFORE UPDATE ON public.psf_cases FOR EACH ROW EXECUTE FUNCTION public.update_psf_cases_updated_at();

CREATE TRIGGER trg_razorpay_orders_updated_at BEFORE UPDATE ON public.razorpay_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_unanswered_updated_at BEFORE UPDATE ON public.unanswered_questions FOR EACH ROW EXECUTE FUNCTION public.set_unanswered_updated_at();

CREATE TRIGGER trg_phase5_wallet_apply_transaction AFTER INSERT ON public.wallet_transactions FOR EACH ROW EXECUTE FUNCTION public.phase5_wallet_apply_transaction();

CREATE TRIGGER trg_phase5_wallet_prevent_negative_balance BEFORE INSERT ON public.wallet_transactions FOR EACH ROW EXECUTE FUNCTION public.phase5_wallet_prevent_negative_balance();


  create policy "Authenticated users can upload knowledge documents"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'knowledge-documents'::text));



  create policy "Service role can access knowledge base"
  on "storage"."objects"
  as permissive
  for all
  to service_role
using ((bucket_id = 'knowledge-base'::text))
with check ((bucket_id = 'knowledge-base'::text));



  create policy "Service role can access knowledge documents"
  on "storage"."objects"
  as permissive
  for all
  to service_role
using ((bucket_id = 'knowledge-documents'::text))
with check ((bucket_id = 'knowledge-documents'::text));



  create policy "kb_auth_delete_scoped"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'knowledge-base'::text) AND (name ~~ 'kb/%'::text) AND (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND ((ou.organization_id)::text = split_part(objects.name, '/'::text, 2)))))));



  create policy "kb_auth_insert_scoped"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'knowledge-base'::text) AND (name ~~ 'kb/%'::text) AND (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND ((ou.organization_id)::text = split_part(objects.name, '/'::text, 2)))))));



  create policy "kb_auth_read_scoped"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'knowledge-base'::text) AND (name ~~ 'kb/%'::text) AND (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND ((ou.organization_id)::text = split_part(objects.name, '/'::text, 2)))))));



  create policy "kb_auth_update_scoped"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'knowledge-base'::text) AND (name ~~ 'kb/%'::text) AND (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND ((ou.organization_id)::text = split_part(objects.name, '/'::text, 2)))))))
with check (((bucket_id = 'knowledge-base'::text) AND (name ~~ 'kb/%'::text) AND (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND ((ou.organization_id)::text = split_part(objects.name, '/'::text, 2)))))));



  create policy "public read template media"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = ANY (ARRAY['whatsapp-template-images'::text, 'whatsapp-template-documents'::text])));



  create policy "upload template documents"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'whatsapp-template-documents'::text));



  create policy "upload template images"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'whatsapp-template-images'::text));



