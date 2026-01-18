


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "http" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";






CREATE TYPE "public"."campaign_message_status" AS ENUM (
    'pending',
    'queued',
    'sent',
    'delivered',
    'failed',
    'cancelled',
    'read'
);


ALTER TYPE "public"."campaign_message_status" OWNER TO "postgres";


CREATE TYPE "public"."campaign_status" AS ENUM (
    'draft',
    'scheduled',
    'sending',
    'completed',
    'cancelled',
    'failed'
);


ALTER TYPE "public"."campaign_status" OWNER TO "postgres";


CREATE TYPE "public"."message_sender" AS ENUM (
    'user',
    'bot',
    'customer',
    'agent'
);


ALTER TYPE "public"."message_sender" OWNER TO "postgres";


CREATE TYPE "public"."psf_resolution_status" AS ENUM (
    'open',
    'resolved'
);


ALTER TYPE "public"."psf_resolution_status" OWNER TO "postgres";


CREATE TYPE "public"."psf_sentiment" AS ENUM (
    'positive',
    'neutral',
    'negative',
    'no_reply'
);


ALTER TYPE "public"."psf_sentiment" OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."campaign_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "contact_id" "uuid",
    "phone" "text" NOT NULL,
    "variables" "jsonb",
    "status" "public"."campaign_message_status" DEFAULT 'pending'::"public"."campaign_message_status" NOT NULL,
    "error" "text",
    "whatsapp_message_id" "text",
    "dispatched_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "replied_at" timestamp with time zone,
    "reply_whatsapp_message_id" "text",
    "reply_text" "text",
    "rendered_text" "text",
    "raw_row" "jsonb",
    "send_attempts" integer DEFAULT 0 NOT NULL,
    "next_retry_at" timestamp with time zone,
    "locked_at" timestamp with time zone,
    "locked_by" "text",
    "last_attempt_at" timestamp with time zone,
    CONSTRAINT "campaign_messages_send_attempts_nonnegative" CHECK (("send_attempts" >= 0))
);


ALTER TABLE "public"."campaign_messages" OWNER TO "postgres";


COMMENT ON COLUMN "public"."campaign_messages"."rendered_text" IS 'Final resolved message text sent to customer (human readable)';



CREATE OR REPLACE FUNCTION "public"."claim_campaign_messages"("p_campaign_id" "uuid", "p_limit" integer, "p_worker_id" "text", "p_lock_ttl_seconds" integer DEFAULT 300) RETURNS SETOF "public"."campaign_messages"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."claim_campaign_messages"("p_campaign_id" "uuid", "p_limit" integer, "p_worker_id" "text", "p_lock_ttl_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_psf_case_on_campaign_message"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."create_psf_case_on_campaign_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_knowledge_chunks"("query_embedding" "public"."vector", "match_count" integer DEFAULT 20, "match_threshold" double precision DEFAULT 0.3) RETURNS TABLE("id" "uuid", "article_id" "uuid", "chunk" "text", "similarity" double precision)
    LANGUAGE "sql" STABLE
    AS $$
  select
    kc.id,
    kc.article_id,
    kc.chunk,
    1 - (kc.embedding <=> query_embedding) as similarity
  from knowledge_chunks kc
  where kc.embedding <=> query_embedding < 1 - match_threshold
  order by kc.embedding <=> query_embedding
  limit match_count;
$$;


ALTER FUNCTION "public"."match_knowledge_chunks"("query_embedding" "public"."vector", "match_count" integer, "match_threshold" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_knowledge_chunks"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "org_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("article_id" "uuid", "organization_id" "uuid", "content" "text", "similarity" double precision)
    LANGUAGE "sql" STABLE
    AS $$
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
$$;


ALTER FUNCTION "public"."match_knowledge_chunks"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_knowledge_chunks"("query_embedding" "public"."vector", "match_count" integer DEFAULT 20, "match_threshold" double precision DEFAULT 0.3, "p_organization_id" "uuid" DEFAULT NULL::"uuid", "p_only_published" boolean DEFAULT true) RETURNS TABLE("id" "uuid", "article_id" "uuid", "chunk" "text", "similarity" double precision, "article_title" "text")
    LANGUAGE "sql" STABLE
    AS $$
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
$$;


ALTER FUNCTION "public"."match_knowledge_chunks"("query_embedding" "public"."vector", "match_count" integer, "match_threshold" double precision, "p_organization_id" "uuid", "p_only_published" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_knowledge_chunks_scoped"("query_embedding" "public"."vector", "p_organization_id" "uuid", "match_count" integer, "match_threshold" double precision, "p_only_published" boolean) RETURNS TABLE("id" "uuid", "article_id" "uuid", "article_title" "text", "chunk" "text", "similarity" double precision)
    LANGUAGE "sql" STABLE
    AS $$
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
$$;


ALTER FUNCTION "public"."match_knowledge_chunks_scoped"("query_embedding" "public"."vector", "p_organization_id" "uuid", "match_count" integer, "match_threshold" double precision, "p_only_published" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."phase5_create_wallet_for_org"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.wallets (organization_id)
  values (new.id)
  on conflict (organization_id) do nothing;

  return new;
end;
$$;


ALTER FUNCTION "public"."phase5_create_wallet_for_org"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."phase5_wallet_apply_transaction"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."phase5_wallet_apply_transaction"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."phase5_wallet_manual_credit"("p_organization_id" "uuid", "p_amount" numeric, "p_note" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."phase5_wallet_manual_credit"("p_organization_id" "uuid", "p_amount" numeric, "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."phase5_wallet_prevent_negative_balance"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."phase5_wallet_prevent_negative_balance"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."phase6_log_unanswered_question"("p_organization_id" "uuid", "p_conversation_id" "uuid", "p_channel" "text", "p_user_message" "text", "p_ai_response" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."phase6_log_unanswered_question"("p_organization_id" "uuid", "p_conversation_id" "uuid", "p_channel" "text", "p_user_message" "text", "p_ai_response" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_active_organization"("p_organization_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."set_active_organization"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_message_order_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.order_at := coalesce(new.wa_received_at, new.sent_at, new.created_at, now());
  return new;
end;
$$;


ALTER FUNCTION "public"."set_message_order_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_message_organization_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."set_message_organization_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_unanswered_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end $$;


ALTER FUNCTION "public"."set_unanswered_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end $$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_psf_cases_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_psf_cases_updated_at"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_turn_traces" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "conversation_id" "uuid",
    "request_id" "text",
    "channel" "text",
    "caller_type" "text",
    "input_message_id" "uuid",
    "output_message_id" "uuid",
    "user_text" "text",
    "intent" "text",
    "workflow_id" "uuid",
    "kb_used" boolean DEFAULT false NOT NULL,
    "kb_reason" "text",
    "kb_threshold" numeric,
    "kb_top_score" numeric,
    "kb_chunks" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "model_provider" "text",
    "model_name" "text",
    "prompt_hash" "text",
    "prompt_tokens" integer,
    "completion_tokens" integer,
    "total_tokens" integer,
    "estimated_cost_usd" numeric,
    "decision" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "error_stage" "text",
    "error" "jsonb",
    "status" "text" DEFAULT 'started'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone
);


ALTER TABLE "public"."ai_turn_traces" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."ai_failures_last_24h_view" AS
 SELECT "id",
    "organization_id",
    "conversation_id",
    "request_id",
    "channel",
    "caller_type",
    "input_message_id",
    "output_message_id",
    "user_text",
    "intent",
    "workflow_id",
    "kb_used",
    "kb_reason",
    "kb_threshold",
    "kb_top_score",
    "kb_chunks",
    "model_provider",
    "model_name",
    "prompt_hash",
    "prompt_tokens",
    "completion_tokens",
    "total_tokens",
    "estimated_cost_usd",
    "decision",
    "error_stage",
    "error",
    "status",
    "started_at",
    "finished_at"
   FROM "public"."ai_turn_traces"
  WHERE (("started_at" >= ("now"() - '24:00:00'::interval)) AND ("status" = 'failed'::"text"))
  ORDER BY "started_at" DESC;


ALTER VIEW "public"."ai_failures_last_24h_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "ai_enabled" boolean DEFAULT true NOT NULL,
    "provider" "text" NOT NULL,
    "model" "text" NOT NULL,
    "kb_search_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_settings_kb_search_type_check" CHECK (("kb_search_type" = ANY (ARRAY['default'::"text", 'hybrid'::"text", 'title'::"text"]))),
    CONSTRAINT "ai_settings_provider_check" CHECK (("provider" = ANY (ARRAY['openai'::"text", 'gemini'::"text"])))
);


ALTER TABLE "public"."ai_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_usage_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "conversation_id" "uuid",
    "message_id" "uuid",
    "provider" "text" NOT NULL,
    "model" "text" NOT NULL,
    "input_tokens" integer DEFAULT 0 NOT NULL,
    "output_tokens" integer DEFAULT 0 NOT NULL,
    "total_tokens" integer DEFAULT 0 NOT NULL,
    "estimated_cost" numeric(10,4) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "charged_amount" numeric(10,4) DEFAULT 0 NOT NULL,
    "wallet_transaction_id" "uuid"
);


ALTER TABLE "public"."ai_usage_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "actor_user_id" "uuid",
    "actor_email" "text",
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid",
    "before_state" "jsonb",
    "after_state" "jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bot_instructions" (
    "organization_id" "uuid" NOT NULL,
    "rules" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."bot_instructions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bot_personality" (
    "organization_id" "uuid" NOT NULL,
    "tone" "text" DEFAULT 'Professional'::"text" NOT NULL,
    "language" "text" DEFAULT 'English'::"text" NOT NULL,
    "short_responses" boolean DEFAULT false,
    "emoji_usage" boolean DEFAULT true,
    "gender_voice" "text" DEFAULT 'Neutral'::"text" NOT NULL,
    "fallback_message" "text" DEFAULT 'Let me connect you with an advisor.'::"text" NOT NULL,
    "business_context" "text",
    "dos" "text",
    "donts" "text",
    "greeting_message" "text",
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL
);


ALTER TABLE "public"."bot_personality" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "channel" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "status" "public"."campaign_status" DEFAULT 'draft'::"public"."campaign_status" NOT NULL,
    "scheduled_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "template_body" "text" NOT NULL,
    "template_variables" "text"[],
    "total_recipients" integer DEFAULT 0 NOT NULL,
    "sent_count" integer DEFAULT 0 NOT NULL,
    "failed_count" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "template_name" "text",
    "whatsapp_template_id" "uuid",
    "launched_at" timestamp with time zone,
    "variable_mapping" "jsonb" DEFAULT '{}'::"jsonb",
    "campaign_kind" "text",
    "parent_campaign_id" "uuid",
    "reply_sheet_tab" "text",
    "meta" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "campaigns_campaign_kind_check" CHECK (("campaign_kind" = ANY (ARRAY['general'::"text", 'psf_initial'::"text", 'psf_reminder'::"text"])))
);


ALTER TABLE "public"."campaigns" OWNER TO "postgres";


COMMENT ON COLUMN "public"."campaigns"."status" IS 'draft | scheduled | sending | completed | failed';



COMMENT ON COLUMN "public"."campaigns"."launched_at" IS 'Timestamp when campaign was manually launched (Launch Now)';



COMMENT ON COLUMN "public"."campaigns"."variable_mapping" IS 'Maps WhatsApp template variables to contact fields. Example: { "1": "first_name", "2": "model" }';



CREATE OR REPLACE VIEW "public"."campaign_analytics_summary" AS
 SELECT "c"."organization_id",
    "c"."id" AS "campaign_id",
    "count"("cm"."id") AS "total_messages",
    "count"(DISTINCT "cm"."contact_id") AS "total_contacts"
   FROM ("public"."campaigns" "c"
     LEFT JOIN "public"."campaign_messages" "cm" ON (("cm"."campaign_id" = "c"."id")))
  GROUP BY "c"."organization_id", "c"."id";


ALTER VIEW "public"."campaign_analytics_summary" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."campaign_analytics_summary_v2" AS
 SELECT "organization_id",
    "campaign_id",
    "total_messages",
    "total_contacts"
   FROM "public"."campaign_analytics_summary";


ALTER VIEW "public"."campaign_analytics_summary_v2" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_delivery_import" (
    "phone" "text",
    "campaign_name" "text"
);


ALTER TABLE "public"."campaign_delivery_import" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_delivery_receipt_failures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "whatsapp_message_id" "text",
    "status" "text",
    "error_title" "text",
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "raw_status" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "raw_value" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."campaign_delivery_receipt_failures" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."campaign_message_status_summary" AS
 SELECT "campaign_id",
    ("count"(*))::integer AS "total",
    ("count"(*) FILTER (WHERE ("status" = 'pending'::"public"."campaign_message_status")))::integer AS "pending_count",
    ("count"(*) FILTER (WHERE ("status" = 'queued'::"public"."campaign_message_status")))::integer AS "queued_count",
    ("count"(*) FILTER (WHERE ("status" = 'sent'::"public"."campaign_message_status")))::integer AS "sent_count",
    ("count"(*) FILTER (WHERE ("status" = 'delivered'::"public"."campaign_message_status")))::integer AS "delivered_count",
    ("count"(*) FILTER (WHERE ("status" = 'failed'::"public"."campaign_message_status")))::integer AS "failed_count",
    ("count"(*) FILTER (WHERE ("status" = 'cancelled'::"public"."campaign_message_status")))::integer AS "cancelled_count",
    "max"("dispatched_at") AS "last_dispatched_at",
    "max"("delivered_at") AS "last_delivered_at"
   FROM "public"."campaign_messages" "cm"
  GROUP BY "campaign_id";


ALTER VIEW "public"."campaign_message_status_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "phone" "text" NOT NULL,
    "name" "text",
    "labels" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "first_name" "text",
    "last_name" "text",
    "model" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."contacts" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."contact_campaign_summary" WITH ("security_invoker"='on') AS
 SELECT "ct"."id" AS "contact_id",
    "ct"."organization_id",
    "ct"."first_name",
    "ct"."last_name",
    "ct"."phone",
    "ct"."model",
    COALESCE("array_remove"("array_agg"(DISTINCT COALESCE("c"."template_name", "c"."name")) FILTER (WHERE ("cm"."status" = 'delivered'::"public"."campaign_message_status")), NULL::"text"), '{}'::"text"[]) AS "delivered_campaigns",
    COALESCE("array_remove"("array_agg"(DISTINCT COALESCE("c"."template_name", "c"."name")) FILTER (WHERE ("cm"."status" = 'failed'::"public"."campaign_message_status")), NULL::"text"), '{}'::"text"[]) AS "failed_campaigns"
   FROM (("public"."contacts" "ct"
     LEFT JOIN "public"."campaign_messages" "cm" ON ((("cm"."organization_id" = "ct"."organization_id") AND ("cm"."phone" = "ct"."phone"))))
     LEFT JOIN "public"."campaigns" "c" ON ((("c"."id" = "cm"."campaign_id") AND ("c"."organization_id" = "ct"."organization_id"))))
  GROUP BY "ct"."id", "ct"."organization_id", "ct"."first_name", "ct"."last_name", "ct"."phone", "ct"."model";


ALTER VIEW "public"."contact_campaign_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contact_uploads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "file_name" "text",
    "inserted_count" integer,
    "updated_count" integer,
    "skipped_count" integer,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."contact_uploads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_state" (
    "conversation_id" "uuid" NOT NULL,
    "workflow_id" "uuid" NOT NULL,
    "current_step" integer DEFAULT 1 NOT NULL,
    "variables" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_step_reason" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."conversation_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "contact_id" "uuid",
    "assigned_to" "uuid",
    "ai_enabled" boolean DEFAULT true,
    "channel" "text" DEFAULT 'web'::"text" NOT NULL,
    "last_message_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "whatsapp_user_phone" "text",
    "intent" "text",
    "intent_source" "text" DEFAULT 'ai'::"text",
    "intent_update_count" integer DEFAULT 0 NOT NULL,
    "ai_summary" "text",
    "ai_last_entities" "jsonb",
    "ai_context_updated_at" timestamp with time zone,
    "ai_mode" "text" DEFAULT 'auto'::"text",
    "ai_locked" boolean DEFAULT false NOT NULL,
    "ai_locked_by" "uuid",
    "ai_locked_at" timestamp with time zone,
    "ai_lock_reason" "text",
    "ai_locked_until" timestamp with time zone,
    "campaign_id" "uuid",
    "workflow_id" "uuid",
    "campaign_context" "jsonb" DEFAULT '{}'::"jsonb",
    "campaign_reply_sheet_tab" "text",
    CONSTRAINT "conversations_ai_mode_check" CHECK (("ai_mode" = ANY (ARRAY['auto'::"text", 'suggest'::"text", 'off'::"text"]))),
    CONSTRAINT "conversations_channel_check" CHECK (("channel" = ANY (ARRAY['web'::"text", 'whatsapp'::"text", 'internal'::"text"])))
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


COMMENT ON COLUMN "public"."conversations"."intent" IS 'AI classified intent: sales | service | finance | accessories | general';



COMMENT ON COLUMN "public"."conversations"."intent_source" IS 'ai | manual';



COMMENT ON COLUMN "public"."conversations"."intent_update_count" IS 'How many times intent was updated by AI (caps intent churn).';



CREATE TABLE IF NOT EXISTS "public"."message_delivery_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "message_id" "uuid",
    "campaign_message_id" "uuid",
    "event_type" "text" NOT NULL,
    "source" "text" NOT NULL,
    "event_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."message_delivery_events" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."delivery_failures_last_24h_view" AS
 SELECT "id",
    "organization_id",
    "message_id",
    "campaign_message_id",
    "event_type",
    "source",
    "event_at",
    "payload"
   FROM "public"."message_delivery_events"
  WHERE (("event_at" >= ("now"() - '24:00:00'::interval)) AND ("event_type" = 'failed'::"text"))
  ORDER BY "event_at" DESC;


ALTER VIEW "public"."delivery_failures_last_24h_view" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."failure_reason_summary" AS
 SELECT "organization_id",
    'unknown'::"text" AS "failure_reason",
    "count"(*) AS "total"
   FROM "public"."campaigns" "c"
  GROUP BY "organization_id";


ALTER VIEW "public"."failure_reason_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."knowledge_articles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "source_type" "text" DEFAULT 'text'::"text" NOT NULL,
    "source_filename" "text",
    "raw_content" "text",
    "last_processed_at" timestamp with time zone,
    "processing_error" "text",
    "file_bucket" "text",
    "file_path" "text",
    "mime_type" "text",
    "original_filename" "text",
    "keywords" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "status" "text" DEFAULT 'draft'::"text",
    "published_at" timestamp with time zone,
    "updated_by" "uuid",
    "processing_status" "text",
    CONSTRAINT "knowledge_articles_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."knowledge_articles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."knowledge_chunks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "article_id" "uuid" NOT NULL,
    "chunk" "text" NOT NULL,
    "embedding" "public"."vector"(1536) NOT NULL,
    "chunk_index" integer DEFAULT 0 NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."knowledge_chunks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_delivery_dlq" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "source" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."message_delivery_dlq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid",
    "sender" "public"."message_sender" NOT NULL,
    "message_type" "text" DEFAULT 'text'::"text" NOT NULL,
    "text" "text",
    "media_url" "text",
    "channel" "text" DEFAULT 'web'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "mime_type" "text",
    "whatsapp_message_id" "text",
    "wa_received_at" timestamp with time zone,
    "campaign_id" "uuid",
    "campaign_message_id" "uuid",
    "outbound_dedupe_key" "text",
    "whatsapp_status" "text",
    "sent_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "read_at" timestamp with time zone,
    "metadata" "jsonb",
    "organization_id" "uuid" NOT NULL,
    "order_at" timestamp with time zone,
    CONSTRAINT "messages_channel_check" CHECK (("channel" = ANY (ARRAY['web'::"text", 'whatsapp'::"text", 'internal'::"text"])))
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."model_analytics_summary" AS
 SELECT "organization_id",
    "count"(*) AS "total_campaigns"
   FROM "public"."campaigns"
  GROUP BY "organization_id";


ALTER VIEW "public"."model_analytics_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'agent'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_primary" boolean DEFAULT true,
    "last_active_at" timestamp with time zone,
    CONSTRAINT "organization_users_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'agent'::"text"])))
);


ALTER TABLE "public"."organization_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "logo_url" "text",
    "type" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_active" boolean DEFAULT true NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "google_sheet_id" "text",
    CONSTRAINT "organizations_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'suspended'::"text"])))
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."psf_cases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "conversation_id" "uuid",
    "phone" "text" NOT NULL,
    "uploaded_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "initial_sent_at" timestamp with time zone,
    "reminder_sent_at" timestamp with time zone,
    "last_customer_reply_at" timestamp with time zone,
    "sentiment" "text",
    "ai_summary" "text",
    "action_required" boolean DEFAULT false NOT NULL,
    "resolution_status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "customer_name" "text",
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    "reminder_count" integer DEFAULT 0 NOT NULL,
    "last_reminder_at" timestamp with time zone,
    "first_customer_reply_at" timestamp with time zone,
    CONSTRAINT "psf_cases_resolution_status_check" CHECK (("resolution_status" = ANY (ARRAY['open'::"text", 'resolved'::"text"]))),
    CONSTRAINT "psf_cases_sentiment_check" CHECK (("sentiment" = ANY (ARRAY['positive'::"text", 'negative'::"text", 'neutral'::"text"])))
);


ALTER TABLE "public"."psf_cases" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."psf_cases_view" WITH ("security_invoker"='true') AS
 SELECT "pc"."id",
    "pc"."organization_id",
    "pc"."phone",
    "pc"."customer_name",
    "pc"."uploaded_data",
    "pc"."sentiment",
    "pc"."ai_summary",
    "pc"."action_required",
    "pc"."resolution_status",
    "pc"."resolved_at",
    "pc"."reminder_count",
    "pc"."last_reminder_at",
    "pc"."initial_sent_at",
    "pc"."first_customer_reply_at",
    "pc"."last_customer_reply_at",
    "pc"."created_at",
    "c"."id" AS "conversation_id",
    "c"."channel",
    "c"."last_message_at"
   FROM ("public"."psf_cases" "pc"
     LEFT JOIN "public"."conversations" "c" ON (("c"."id" = "pc"."conversation_id")));


ALTER VIEW "public"."psf_cases_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."razorpay_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "wallet_id" "uuid" NOT NULL,
    "amount_paise" integer NOT NULL,
    "currency" "text" DEFAULT 'INR'::"text" NOT NULL,
    "receipt" "text" NOT NULL,
    "status" "text" DEFAULT 'created'::"text" NOT NULL,
    "razorpay_order_id" "text" NOT NULL,
    "notes" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "razorpay_orders_amount_paise_check" CHECK (("amount_paise" > 0))
);


ALTER TABLE "public"."razorpay_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."razorpay_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "wallet_id" "uuid" NOT NULL,
    "razorpay_order_id" "text" NOT NULL,
    "razorpay_payment_id" "text" NOT NULL,
    "amount_paise" integer NOT NULL,
    "currency" "text" DEFAULT 'INR'::"text" NOT NULL,
    "status" "text" NOT NULL,
    "raw_event" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "razorpay_payments_amount_paise_check" CHECK (("amount_paise" > 0))
);


ALTER TABLE "public"."razorpay_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."replay_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "requested_by" "uuid" DEFAULT "auth"."uid"(),
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "last_error" "text",
    "result" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."replay_requests" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."stuck_campaign_messages_view" AS
 SELECT "id",
    "organization_id",
    "campaign_id",
    "contact_id",
    "phone",
    "variables",
    "status",
    "error",
    "whatsapp_message_id",
    "dispatched_at",
    "delivered_at",
    "created_at",
    "replied_at",
    "reply_whatsapp_message_id",
    "reply_text",
    "rendered_text",
    "raw_row",
    "send_attempts",
    "next_retry_at",
    "locked_at",
    "locked_by",
    "last_attempt_at"
   FROM "public"."campaign_messages" "cm"
  WHERE (("status" = ANY (ARRAY['pending'::"public"."campaign_message_status", 'queued'::"public"."campaign_message_status"])) AND ((("locked_at" IS NOT NULL) AND ("locked_at" < ("now"() - '00:10:00'::interval))) OR (("next_retry_at" IS NOT NULL) AND ("next_retry_at" < ("now"() - '00:10:00'::interval)))))
  ORDER BY "created_at";


ALTER VIEW "public"."stuck_campaign_messages_view" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."template_analytics_summary" AS
 SELECT "c"."organization_id",
    "c"."whatsapp_template_id",
    "count"("cm"."id") AS "total_messages"
   FROM ("public"."campaigns" "c"
     JOIN "public"."campaign_messages" "cm" ON (("cm"."campaign_id" = "c"."id")))
  GROUP BY "c"."organization_id", "c"."whatsapp_template_id";


ALTER VIEW "public"."template_analytics_summary" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."template_analytics_summary_v2" AS
 SELECT "organization_id",
    "whatsapp_template_id",
    "total_messages"
   FROM "public"."template_analytics_summary";


ALTER VIEW "public"."template_analytics_summary_v2" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."unanswered_questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "question" "text" NOT NULL,
    "occurrences" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "conversation_id" "uuid",
    "channel" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "ai_response" "text",
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "resolution_article_id" "uuid",
    "resolved_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "unanswered_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'answered'::"text", 'ignored'::"text"])))
);


ALTER TABLE "public"."unanswered_questions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."user_active_organization" AS
 SELECT DISTINCT ON ("ou"."user_id") "ou"."user_id",
    "ou"."organization_id",
    "o"."name",
    COALESCE("ou"."last_active_at", "ou"."created_at") AS "active_at"
   FROM ("public"."organization_users" "ou"
     JOIN "public"."organizations" "o" ON (("o"."id" = "ou"."organization_id")))
  ORDER BY "ou"."user_id", COALESCE("ou"."last_active_at", "ou"."created_at") DESC;


ALTER VIEW "public"."user_active_organization" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wallet_alert_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "wallet_id" "uuid" NOT NULL,
    "alert_type" "text" NOT NULL,
    "triggered_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "wallet_alert_logs_alert_type_check" CHECK (("alert_type" = ANY (ARRAY['low'::"text", 'critical'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."wallet_alert_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wallet_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "wallet_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "direction" "text" NOT NULL,
    "amount" numeric(12,4) NOT NULL,
    "reference_type" "text",
    "reference_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "purpose" "text" DEFAULT 'ai_chat'::"text" NOT NULL,
    "created_by" "uuid",
    "created_by_role" "text" DEFAULT 'system'::"text" NOT NULL,
    "balance_before" numeric(12,4),
    "balance_after" numeric(12,4),
    "organization_id" "uuid" NOT NULL,
    CONSTRAINT "wallet_transactions_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "wallet_transactions_direction_check" CHECK (("direction" = ANY (ARRAY['in'::"text", 'out'::"text"]))),
    CONSTRAINT "wallet_transactions_type_check" CHECK (("type" = ANY (ARRAY['credit'::"text", 'debit'::"text", 'adjustment'::"text"]))),
    CONSTRAINT "wallet_txn_debit_requires_reference" CHECK ((("type" <> 'debit'::"text") OR (("reference_type" = ANY (ARRAY['ai_usage'::"text", 'campaign'::"text", 'voice'::"text"])) AND ("reference_id" IS NOT NULL)))),
    CONSTRAINT "wallet_txn_type_direction_check" CHECK (((("type" = 'credit'::"text") AND ("direction" = 'in'::"text")) OR (("type" = 'debit'::"text") AND ("direction" = 'out'::"text")) OR (("type" = 'adjustment'::"text") AND ("direction" = ANY (ARRAY['in'::"text", 'out'::"text"])))))
);


ALTER TABLE "public"."wallet_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wallets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "balance" numeric(12,4) DEFAULT 0 NOT NULL,
    "total_credited" numeric(12,4) DEFAULT 0 NOT NULL,
    "total_debited" numeric(12,4) DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'INR'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "low_balance_threshold" numeric DEFAULT 50,
    "critical_balance_threshold" numeric DEFAULT 10,
    CONSTRAINT "wallet_threshold_sanity_check" CHECK (("critical_balance_threshold" <= "low_balance_threshold")),
    CONSTRAINT "wallets_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'suspended'::"text"])))
);


ALTER TABLE "public"."wallets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_bulk_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "phone" "text" NOT NULL,
    "template" "text" NOT NULL,
    "status" "text" NOT NULL,
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."whatsapp_bulk_logs" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."whatsapp_overview_daily_v1" AS
 SELECT "c"."organization_id",
    "date_trunc"('day'::"text", "m"."created_at") AS "day",
    "count"(*) AS "total_messages",
    "count"(DISTINCT "c"."id") AS "total_conversations",
    "count"(DISTINCT "c"."contact_id") AS "total_contacts"
   FROM ("public"."conversations" "c"
     JOIN "public"."messages" "m" ON (("m"."conversation_id" = "c"."id")))
  GROUP BY "c"."organization_id", ("date_trunc"('day'::"text", "m"."created_at"));


ALTER VIEW "public"."whatsapp_overview_daily_v1" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "phone_number" "text",
    "api_token" "text",
    "verify_token" "text",
    "whatsapp_phone_id" "text",
    "whatsapp_business_id" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."whatsapp_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" DEFAULT 'MARKETING'::"text",
    "language" "text" DEFAULT 'en'::"text",
    "header_type" "text",
    "header_text" "text",
    "body" "text",
    "footer" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "meta_template_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "header_media_url" "text",
    "header_media_mime" "text",
    "header_variable_count" integer DEFAULT 0 NOT NULL,
    "header_variable_indices" integer[],
    "body_variable_count" integer DEFAULT 0 NOT NULL,
    "body_variable_indices" integer[],
    CONSTRAINT "whatsapp_templates_body_var_check" CHECK (((("body_variable_count" = 0) AND ("body_variable_indices" IS NULL)) OR (("body_variable_count" > 0) AND ("cardinality"("body_variable_indices") = "body_variable_count")))),
    CONSTRAINT "whatsapp_templates_header_var_check" CHECK (((("header_variable_count" = 0) AND ("header_variable_indices" IS NULL)) OR (("header_variable_count" > 0) AND ("cardinality"("header_variable_indices") = "header_variable_count"))))
);


ALTER TABLE "public"."whatsapp_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workflow_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workflow_id" "uuid",
    "conversation_id" "uuid",
    "step_id" "uuid",
    "data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "current_step_number" integer,
    "variables" "jsonb" DEFAULT '{}'::"jsonb",
    "completed" boolean DEFAULT false NOT NULL,
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."workflow_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workflow_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workflow_id" "uuid",
    "step_order" integer NOT NULL,
    "action" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "instruction_text" "text",
    "expected_user_input" "text",
    "ai_action" "text" DEFAULT 'give_information'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "organization_id" "uuid" NOT NULL,
    CONSTRAINT "workflow_steps_ai_action_check" CHECK (("ai_action" = ANY (ARRAY['ask_question'::"text", 'give_information'::"text", 'use_knowledge_base'::"text", 'save_user_response'::"text", 'branch'::"text", 'end'::"text"])))
);


ALTER TABLE "public"."workflow_steps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workflows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "trigger" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "mode" "text" DEFAULT 'strict'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "trigger_type" "text" DEFAULT 'keyword'::"text" NOT NULL,
    CONSTRAINT "workflows_mode_check" CHECK (("mode" = ANY (ARRAY['strict'::"text", 'smart'::"text"]))),
    CONSTRAINT "workflows_trigger_type_check" CHECK (("trigger_type" = ANY (ARRAY['keyword'::"text", 'intent'::"text", 'always'::"text"])))
);


ALTER TABLE "public"."workflows" OWNER TO "postgres";


ALTER TABLE ONLY "public"."ai_settings"
    ADD CONSTRAINT "ai_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_turn_traces"
    ADD CONSTRAINT "ai_turn_traces_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_usage_logs"
    ADD CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bot_personality"
    ADD CONSTRAINT "bot_personality_org_unique" UNIQUE ("organization_id");



ALTER TABLE ONLY "public"."bot_personality"
    ADD CONSTRAINT "bot_personality_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_delivery_receipt_failures"
    ADD CONSTRAINT "campaign_delivery_receipt_failures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_messages"
    ADD CONSTRAINT "campaign_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_uploads"
    ADD CONSTRAINT "contact_uploads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_state"
    ADD CONSTRAINT "conversation_state_pkey" PRIMARY KEY ("conversation_id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."knowledge_articles"
    ADD CONSTRAINT "knowledge_articles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."knowledge_chunks"
    ADD CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_delivery_dlq"
    ADD CONSTRAINT "message_delivery_dlq_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_delivery_events"
    ADD CONSTRAINT "message_delivery_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_users"
    ADD CONSTRAINT "organization_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."psf_cases"
    ADD CONSTRAINT "psf_cases_campaign_id_phone_key" UNIQUE ("campaign_id", "phone");



ALTER TABLE ONLY "public"."psf_cases"
    ADD CONSTRAINT "psf_cases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."razorpay_orders"
    ADD CONSTRAINT "razorpay_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."razorpay_orders"
    ADD CONSTRAINT "razorpay_orders_razorpay_order_id_key" UNIQUE ("razorpay_order_id");



ALTER TABLE ONLY "public"."razorpay_payments"
    ADD CONSTRAINT "razorpay_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."razorpay_payments"
    ADD CONSTRAINT "razorpay_payments_razorpay_payment_id_key" UNIQUE ("razorpay_payment_id");



ALTER TABLE ONLY "public"."replay_requests"
    ADD CONSTRAINT "replay_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."unanswered_questions"
    ADD CONSTRAINT "unanswered_questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallet_alert_logs"
    ADD CONSTRAINT "wallet_alert_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallet_transactions"
    ADD CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."wallet_transactions"
    ADD CONSTRAINT "wallet_txn_balance_snapshots_present" CHECK ((("balance_before" IS NOT NULL) AND ("balance_after" IS NOT NULL))) NOT VALID;



ALTER TABLE ONLY "public"."wallets"
    ADD CONSTRAINT "wallets_organization_id_key" UNIQUE ("organization_id");



ALTER TABLE ONLY "public"."wallets"
    ADD CONSTRAINT "wallets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_bulk_logs"
    ADD CONSTRAINT "whatsapp_bulk_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_settings"
    ADD CONSTRAINT "whatsapp_settings_organization_unique" UNIQUE ("organization_id");



ALTER TABLE ONLY "public"."whatsapp_settings"
    ADD CONSTRAINT "whatsapp_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_templates"
    ADD CONSTRAINT "whatsapp_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflow_logs"
    ADD CONSTRAINT "workflow_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflow_steps"
    ADD CONSTRAINT "workflow_steps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflows"
    ADD CONSTRAINT "workflows_pkey" PRIMARY KEY ("id");



CREATE INDEX "ai_turn_traces_conv_started_at_idx" ON "public"."ai_turn_traces" USING "btree" ("conversation_id", "started_at" DESC);



CREATE INDEX "ai_turn_traces_org_started_at_idx" ON "public"."ai_turn_traces" USING "btree" ("organization_id", "started_at" DESC);



CREATE INDEX "audit_logs_created_at_idx" ON "public"."audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "audit_logs_entity_idx" ON "public"."audit_logs" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "audit_logs_org_idx" ON "public"."audit_logs" USING "btree" ("organization_id");



CREATE INDEX "campaign_messages_claim_idx" ON "public"."campaign_messages" USING "btree" ("campaign_id", "status", "next_retry_at", "created_at");



CREATE INDEX "cdrf_org_received_idx" ON "public"."campaign_delivery_receipt_failures" USING "btree" ("organization_id", "received_at" DESC);



CREATE UNIQUE INDEX "contacts_org_phone_uq" ON "public"."contacts" USING "btree" ("organization_id", "phone");



CREATE INDEX "conversations_ai_locked_idx" ON "public"."conversations" USING "btree" ("organization_id", "ai_locked");



CREATE INDEX "conversations_ai_locked_until_idx" ON "public"."conversations" USING "btree" ("organization_id", "ai_locked_until");



CREATE UNIQUE INDEX "conversations_whatsapp_unique" ON "public"."conversations" USING "btree" ("organization_id", "contact_id") WHERE ("channel" = 'whatsapp'::"text");



CREATE INDEX "idx_ai_settings_org" ON "public"."ai_settings" USING "btree" ("organization_id");



CREATE INDEX "idx_ai_usage_logs_created" ON "public"."ai_usage_logs" USING "btree" ("created_at");



CREATE INDEX "idx_ai_usage_logs_org" ON "public"."ai_usage_logs" USING "btree" ("organization_id");



CREATE INDEX "idx_campaign_messages_campaign" ON "public"."campaign_messages" USING "btree" ("campaign_id");



CREATE INDEX "idx_campaign_messages_campaign_status" ON "public"."campaign_messages" USING "btree" ("campaign_id", "status");



CREATE INDEX "idx_campaign_messages_delivered_at" ON "public"."campaign_messages" USING "btree" ("delivered_at");



CREATE INDEX "idx_campaign_messages_dispatched_at" ON "public"."campaign_messages" USING "btree" ("dispatched_at");



CREATE INDEX "idx_campaign_messages_org_phone_status" ON "public"."campaign_messages" USING "btree" ("organization_id", "phone", "status");



CREATE INDEX "idx_campaign_messages_org_status" ON "public"."campaign_messages" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_campaign_messages_replied_at" ON "public"."campaign_messages" USING "btree" ("replied_at");



CREATE INDEX "idx_campaign_messages_reply" ON "public"."campaign_messages" USING "btree" ("organization_id", "replied_at");



CREATE INDEX "idx_campaign_messages_send_queue" ON "public"."campaign_messages" USING "btree" ("status", "campaign_id", "created_at");



CREATE INDEX "idx_campaign_messages_whatsapp_message_id" ON "public"."campaign_messages" USING "btree" ("whatsapp_message_id") WHERE ("whatsapp_message_id" IS NOT NULL);



CREATE INDEX "idx_campaigns_org" ON "public"."campaigns" USING "btree" ("organization_id");



CREATE INDEX "idx_campaigns_org_status" ON "public"."campaigns" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_campaigns_org_template" ON "public"."campaigns" USING "btree" ("organization_id", "template_name");



CREATE INDEX "idx_campaigns_scheduled_at" ON "public"."campaigns" USING "btree" ("status", "scheduled_at");



CREATE INDEX "idx_campaigns_whatsapp_template_id" ON "public"."campaigns" USING "btree" ("whatsapp_template_id");



CREATE INDEX "idx_contacts_org_metadata" ON "public"."contacts" USING "gin" ("metadata");



CREATE INDEX "idx_contacts_org_model" ON "public"."contacts" USING "btree" ("organization_id", "model");



CREATE INDEX "idx_contacts_org_name" ON "public"."contacts" USING "btree" ("organization_id", "name");



CREATE INDEX "idx_contacts_org_phone" ON "public"."contacts" USING "btree" ("organization_id", "phone");



CREATE INDEX "idx_conversations_ai_context" ON "public"."conversations" USING "btree" ("ai_context_updated_at");



CREATE INDEX "idx_conversations_campaign_id" ON "public"."conversations" USING "btree" ("campaign_id");



CREATE INDEX "idx_conversations_intent" ON "public"."conversations" USING "btree" ("intent");



CREATE INDEX "idx_conversations_org_assigned" ON "public"."conversations" USING "btree" ("organization_id", "assigned_to");



CREATE INDEX "idx_conversations_org_channel_last" ON "public"."conversations" USING "btree" ("organization_id", "channel", "last_message_at");



CREATE INDEX "idx_conversations_org_intent" ON "public"."conversations" USING "btree" ("organization_id", "intent");



CREATE INDEX "idx_conversations_org_last_message_at" ON "public"."conversations" USING "btree" ("organization_id", "last_message_at" DESC);



CREATE INDEX "idx_conversations_workflow_id" ON "public"."conversations" USING "btree" ("workflow_id");



CREATE INDEX "idx_kb_chunks_embedding" ON "public"."knowledge_chunks" USING "ivfflat" ("embedding" "public"."vector_cosine_ops") WITH ("lists"='100');



CREATE INDEX "idx_kb_chunks_org_article" ON "public"."knowledge_chunks" USING "btree" ("organization_id", "article_id");



CREATE INDEX "idx_kb_keywords_gin" ON "public"."knowledge_articles" USING "gin" ("keywords");



CREATE INDEX "idx_knowledge_articles_org_updated" ON "public"."knowledge_articles" USING "btree" ("organization_id", "updated_at" DESC);



CREATE INDEX "idx_knowledge_articles_status" ON "public"."knowledge_articles" USING "btree" ("status");



CREATE INDEX "idx_knowledge_chunks_article_chunk" ON "public"."knowledge_chunks" USING "btree" ("article_id", "chunk_index");



CREATE INDEX "idx_knowledge_chunks_org" ON "public"."knowledge_chunks" USING "btree" ("organization_id");



CREATE INDEX "idx_messages_conversation_created" ON "public"."messages" USING "btree" ("conversation_id", "created_at");



CREATE INDEX "idx_messages_org_conversation_created" ON "public"."messages" USING "btree" ("organization_id", "conversation_id", "created_at");



CREATE INDEX "idx_messages_whatsapp_receipts" ON "public"."messages" USING "btree" ("whatsapp_status") WHERE ("whatsapp_status" IS NOT NULL);



CREATE INDEX "idx_org_users_user_last_active" ON "public"."organization_users" USING "btree" ("user_id", "last_active_at" DESC);



CREATE INDEX "idx_psf_cases_action_required" ON "public"."psf_cases" USING "btree" ("action_required") WHERE ("action_required" = true);



CREATE INDEX "idx_psf_cases_campaign_phone" ON "public"."psf_cases" USING "btree" ("campaign_id", "phone");



CREATE INDEX "idx_psf_cases_conversation" ON "public"."psf_cases" USING "btree" ("conversation_id");



CREATE INDEX "idx_psf_cases_org" ON "public"."psf_cases" USING "btree" ("organization_id");



CREATE INDEX "idx_psf_cases_org_created" ON "public"."psf_cases" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "idx_psf_cases_resolution" ON "public"."psf_cases" USING "btree" ("resolution_status");



CREATE INDEX "idx_psf_cases_sentiment" ON "public"."psf_cases" USING "btree" ("sentiment");



CREATE INDEX "idx_razorpay_orders_created" ON "public"."razorpay_orders" USING "btree" ("created_at");



CREATE INDEX "idx_razorpay_orders_org" ON "public"."razorpay_orders" USING "btree" ("organization_id");



CREATE INDEX "idx_razorpay_orders_wallet" ON "public"."razorpay_orders" USING "btree" ("wallet_id");



CREATE INDEX "idx_razorpay_payments_order" ON "public"."razorpay_payments" USING "btree" ("razorpay_order_id");



CREATE INDEX "idx_razorpay_payments_org" ON "public"."razorpay_payments" USING "btree" ("organization_id");



CREATE INDEX "idx_razorpay_payments_wallet" ON "public"."razorpay_payments" USING "btree" ("wallet_id");



CREATE INDEX "idx_unanswered_last_seen" ON "public"."unanswered_questions" USING "btree" ("last_seen_at" DESC);



CREATE INDEX "idx_unanswered_org_status" ON "public"."unanswered_questions" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_wallet_alerts_org" ON "public"."wallet_alert_logs" USING "btree" ("organization_id");



CREATE INDEX "idx_wallet_alerts_wallet" ON "public"."wallet_alert_logs" USING "btree" ("wallet_id");



CREATE INDEX "idx_wallet_transactions_created" ON "public"."wallet_transactions" USING "btree" ("created_at");



CREATE INDEX "idx_wallet_transactions_created_by" ON "public"."wallet_transactions" USING "btree" ("created_by");



CREATE INDEX "idx_wallet_transactions_purpose" ON "public"."wallet_transactions" USING "btree" ("purpose");



CREATE INDEX "idx_wallet_transactions_reference" ON "public"."wallet_transactions" USING "btree" ("reference_type", "reference_id");



CREATE INDEX "idx_wallet_transactions_wallet" ON "public"."wallet_transactions" USING "btree" ("wallet_id");



CREATE INDEX "idx_wallets_org" ON "public"."wallets" USING "btree" ("organization_id");



CREATE INDEX "idx_whatsapp_templates_org" ON "public"."whatsapp_templates" USING "btree" ("organization_id");



CREATE INDEX "idx_workflow_logs_conversation_active" ON "public"."workflow_logs" USING "btree" ("conversation_id", "completed");



CREATE INDEX "idx_workflow_logs_org_conversation_created" ON "public"."workflow_logs" USING "btree" ("organization_id", "conversation_id", "created_at");



CREATE INDEX "idx_workflow_logs_workflow" ON "public"."workflow_logs" USING "btree" ("workflow_id");



CREATE INDEX "knowledge_articles_org_status_idx" ON "public"."knowledge_articles" USING "btree" ("organization_id", "status");



CREATE INDEX "knowledge_chunks_embedding_hnsw" ON "public"."knowledge_chunks" USING "hnsw" ("embedding" "public"."vector_cosine_ops");



CREATE INDEX "message_delivery_dlq_org_created_at_idx" ON "public"."message_delivery_dlq" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "message_delivery_events_campaign_message_idx" ON "public"."message_delivery_events" USING "btree" ("campaign_message_id", "event_at" DESC);



CREATE INDEX "message_delivery_events_message_idx" ON "public"."message_delivery_events" USING "btree" ("message_id", "event_at" DESC);



CREATE INDEX "message_delivery_events_org_event_at_idx" ON "public"."message_delivery_events" USING "btree" ("organization_id", "event_at" DESC);



CREATE INDEX "messages_conversation_order_at_idx" ON "public"."messages" USING "btree" ("conversation_id", "order_at");



CREATE UNIQUE INDEX "messages_org_outbound_dedupe_key_uniq" ON "public"."messages" USING "btree" ("organization_id", "outbound_dedupe_key") WHERE ("outbound_dedupe_key" IS NOT NULL);



CREATE INDEX "replay_requests_org_requested_at_idx" ON "public"."replay_requests" USING "btree" ("organization_id", "requested_at" DESC);



CREATE UNIQUE INDEX "uniq_contacts_org_phone" ON "public"."contacts" USING "btree" ("organization_id", "phone");



CREATE UNIQUE INDEX "uniq_messages_outbound_dedupe_key" ON "public"."messages" USING "btree" ("conversation_id", "outbound_dedupe_key") WHERE ("outbound_dedupe_key" IS NOT NULL);



CREATE UNIQUE INDEX "uniq_messages_whatsapp_message_id" ON "public"."messages" USING "btree" ("whatsapp_message_id") WHERE ("whatsapp_message_id" IS NOT NULL);



CREATE UNIQUE INDEX "uq_ai_usage_logs_wallet_transaction_id" ON "public"."ai_usage_logs" USING "btree" ("wallet_transaction_id") WHERE ("wallet_transaction_id" IS NOT NULL);



CREATE UNIQUE INDEX "uq_wallet_active_alert" ON "public"."wallet_alert_logs" USING "btree" ("wallet_id", "alert_type") WHERE ("resolved_at" IS NULL);



CREATE UNIQUE INDEX "whatsapp_templates_org_name_lang" ON "public"."whatsapp_templates" USING "btree" ("organization_id", "name", "language");



CREATE OR REPLACE TRIGGER "trg_create_psf_case" AFTER INSERT ON "public"."campaign_messages" FOR EACH ROW EXECUTE FUNCTION "public"."create_psf_case_on_campaign_message"();



CREATE OR REPLACE TRIGGER "trg_messages_set_order_at" BEFORE INSERT OR UPDATE OF "wa_received_at", "sent_at", "created_at" ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."set_message_order_at"();



CREATE OR REPLACE TRIGGER "trg_phase5_create_wallet_for_org" AFTER INSERT ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."phase5_create_wallet_for_org"();



CREATE OR REPLACE TRIGGER "trg_phase5_wallet_apply_transaction" AFTER INSERT ON "public"."wallet_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."phase5_wallet_apply_transaction"();



CREATE OR REPLACE TRIGGER "trg_phase5_wallet_prevent_negative_balance" BEFORE INSERT ON "public"."wallet_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."phase5_wallet_prevent_negative_balance"();



CREATE OR REPLACE TRIGGER "trg_psf_cases_updated_at" BEFORE UPDATE ON "public"."psf_cases" FOR EACH ROW EXECUTE FUNCTION "public"."update_psf_cases_updated_at"();



CREATE OR REPLACE TRIGGER "trg_razorpay_orders_updated_at" BEFORE UPDATE ON "public"."razorpay_orders" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_set_message_organization_id" BEFORE INSERT OR UPDATE OF "conversation_id", "organization_id" ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."set_message_organization_id"();



CREATE OR REPLACE TRIGGER "trg_unanswered_updated_at" BEFORE UPDATE ON "public"."unanswered_questions" FOR EACH ROW EXECUTE FUNCTION "public"."set_unanswered_updated_at"();



ALTER TABLE ONLY "public"."ai_settings"
    ADD CONSTRAINT "ai_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_turn_traces"
    ADD CONSTRAINT "ai_turn_traces_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_turn_traces"
    ADD CONSTRAINT "ai_turn_traces_input_message_id_fkey" FOREIGN KEY ("input_message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_turn_traces"
    ADD CONSTRAINT "ai_turn_traces_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_turn_traces"
    ADD CONSTRAINT "ai_turn_traces_output_message_id_fkey" FOREIGN KEY ("output_message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_turn_traces"
    ADD CONSTRAINT "ai_turn_traces_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_usage_logs"
    ADD CONSTRAINT "ai_usage_logs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_usage_logs"
    ADD CONSTRAINT "ai_usage_logs_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_usage_logs"
    ADD CONSTRAINT "ai_usage_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_usage_logs"
    ADD CONSTRAINT "ai_usage_logs_wallet_transaction_id_fkey" FOREIGN KEY ("wallet_transaction_id") REFERENCES "public"."wallet_transactions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bot_instructions"
    ADD CONSTRAINT "bot_instructions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bot_personality"
    ADD CONSTRAINT "bot_personality_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_messages"
    ADD CONSTRAINT "campaign_messages_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_messages"
    ADD CONSTRAINT "campaign_messages_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_messages"
    ADD CONSTRAINT "campaign_messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_parent_campaign_id_fkey" FOREIGN KEY ("parent_campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_whatsapp_template_id_fkey" FOREIGN KEY ("whatsapp_template_id") REFERENCES "public"."whatsapp_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."knowledge_articles"
    ADD CONSTRAINT "knowledge_articles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."knowledge_chunks"
    ADD CONSTRAINT "knowledge_chunks_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "public"."knowledge_articles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."knowledge_chunks"
    ADD CONSTRAINT "knowledge_chunks_org_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_delivery_dlq"
    ADD CONSTRAINT "message_delivery_dlq_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_delivery_events"
    ADD CONSTRAINT "message_delivery_events_campaign_message_id_fkey" FOREIGN KEY ("campaign_message_id") REFERENCES "public"."campaign_messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."message_delivery_events"
    ADD CONSTRAINT "message_delivery_events_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_delivery_events"
    ADD CONSTRAINT "message_delivery_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_users"
    ADD CONSTRAINT "organization_users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."psf_cases"
    ADD CONSTRAINT "psf_cases_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."psf_cases"
    ADD CONSTRAINT "psf_cases_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."psf_cases"
    ADD CONSTRAINT "psf_cases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."razorpay_orders"
    ADD CONSTRAINT "razorpay_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."razorpay_orders"
    ADD CONSTRAINT "razorpay_orders_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."razorpay_payments"
    ADD CONSTRAINT "razorpay_payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."razorpay_payments"
    ADD CONSTRAINT "razorpay_payments_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."replay_requests"
    ADD CONSTRAINT "replay_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."unanswered_questions"
    ADD CONSTRAINT "unanswered_questions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_alert_logs"
    ADD CONSTRAINT "wallet_alert_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_alert_logs"
    ADD CONSTRAINT "wallet_alert_logs_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_transactions"
    ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallets"
    ADD CONSTRAINT "wallets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_bulk_logs"
    ADD CONSTRAINT "whatsapp_bulk_logs_org_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."whatsapp_settings"
    ADD CONSTRAINT "whatsapp_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_templates"
    ADD CONSTRAINT "whatsapp_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflow_logs"
    ADD CONSTRAINT "workflow_logs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workflow_logs"
    ADD CONSTRAINT "workflow_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflow_logs"
    ADD CONSTRAINT "workflow_logs_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "public"."workflow_steps"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workflow_logs"
    ADD CONSTRAINT "workflow_logs_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflow_steps"
    ADD CONSTRAINT "workflow_steps_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflows"
    ADD CONSTRAINT "workflows_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



CREATE POLICY "Allow insert instructions" ON "public"."bot_instructions" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."user_id" = "auth"."uid"()) AND ("ou"."organization_id" = "bot_instructions"."organization_id")))));



CREATE POLICY "Allow insert personality" ON "public"."bot_personality" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."user_id" = "auth"."uid"()) AND ("ou"."organization_id" = "bot_personality"."organization_id")))));



CREATE POLICY "Allow select instructions" ON "public"."bot_instructions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."user_id" = "auth"."uid"()) AND ("ou"."organization_id" = "bot_instructions"."organization_id")))));



CREATE POLICY "Allow select personality" ON "public"."bot_personality" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."user_id" = "auth"."uid"()) AND ("ou"."organization_id" = "bot_personality"."organization_id")))));



CREATE POLICY "Allow update instructions" ON "public"."bot_instructions" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."user_id" = "auth"."uid"()) AND ("ou"."organization_id" = "bot_instructions"."organization_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."user_id" = "auth"."uid"()) AND ("ou"."organization_id" = "bot_instructions"."organization_id")))));



CREATE POLICY "Allow update personality" ON "public"."bot_personality" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."user_id" = "auth"."uid"()) AND ("ou"."organization_id" = "bot_personality"."organization_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."user_id" = "auth"."uid"()) AND ("ou"."organization_id" = "bot_personality"."organization_id")))));



ALTER TABLE "public"."ai_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_settings_members_all" ON "public"."ai_settings" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."user_id" = "auth"."uid"()) AND ("ou"."organization_id" = "ai_settings"."organization_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."user_id" = "auth"."uid"()) AND ("ou"."organization_id" = "ai_settings"."organization_id")))));



ALTER TABLE "public"."ai_turn_traces" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_turn_traces_read_org" ON "public"."ai_turn_traces" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."user_id" = "auth"."uid"()) AND ("ou"."organization_id" = "ai_turn_traces"."organization_id")))));



CREATE POLICY "ai_turn_traces_write_service_only" ON "public"."ai_turn_traces" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."ai_usage_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_usage_logs_members_read" ON "public"."ai_usage_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."user_id" = "auth"."uid"()) AND ("ou"."organization_id" = "ai_usage_logs"."organization_id")))));



ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_logs_insert_service_role" ON "public"."audit_logs" FOR INSERT WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "audit_logs_read_org" ON "public"."audit_logs" FOR SELECT USING (("organization_id" IN ( SELECT "organization_users"."organization_id"
   FROM "public"."organization_users"
  WHERE ("organization_users"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."bot_instructions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bot_instructions_mod_service_role_only" ON "public"."bot_instructions" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "bot_instructions_org_access" ON "public"."bot_instructions" USING (("organization_id" = (("auth"."jwt"() ->> 'organization_id'::"text"))::"uuid"));



ALTER TABLE "public"."bot_personality" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bot_personality_mod_service_role_only" ON "public"."bot_personality" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "bot_personality_org_access" ON "public"."bot_personality" USING (("organization_id" = (("auth"."jwt"() ->> 'organization_id'::"text"))::"uuid"));



ALTER TABLE "public"."campaign_delivery_import" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_delivery_import_service_role_all" ON "public"."campaign_delivery_import" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."campaign_delivery_receipt_failures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaign_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_messages_members_all" ON "public"."campaign_messages" USING ((("auth"."role"() = 'service_role'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."user_id" = "auth"."uid"()) AND ("ou"."organization_id" = "campaign_messages"."organization_id")))))) WITH CHECK ((("auth"."role"() = 'service_role'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."user_id" = "auth"."uid"()) AND ("ou"."organization_id" = "campaign_messages"."organization_id"))))));



ALTER TABLE "public"."campaigns" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaigns_members_all" ON "public"."campaigns" USING ((("auth"."role"() = 'service_role'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."user_id" = "auth"."uid"()) AND ("ou"."organization_id" = "campaigns"."organization_id")))))) WITH CHECK ((("auth"."role"() = 'service_role'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."user_id" = "auth"."uid"()) AND ("ou"."organization_id" = "campaigns"."organization_id"))))));



CREATE POLICY "cdrf_select_org" ON "public"."campaign_delivery_receipt_failures" FOR SELECT TO "authenticated" USING (("organization_id" IN ( SELECT "ou"."organization_id"
   FROM "public"."organization_users" "ou"
  WHERE ("ou"."user_id" = "auth"."uid"()))));



CREATE POLICY "cdrf_service_role_all" ON "public"."campaign_delivery_receipt_failures" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."contact_uploads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contact_uploads_members_all" ON "public"."contact_uploads" TO "authenticated" USING (("organization_id" IN ( SELECT "ou"."organization_id"
   FROM "public"."organization_users" "ou"
  WHERE ("ou"."user_id" = "auth"."uid"())))) WITH CHECK (("organization_id" IN ( SELECT "ou"."organization_id"
   FROM "public"."organization_users" "ou"
  WHERE ("ou"."user_id" = "auth"."uid"()))));



CREATE POLICY "contact_uploads_service_role_all" ON "public"."contact_uploads" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contacts_delete_org_members" ON "public"."contacts" FOR DELETE USING ((("auth"."role"() = 'service_role'::"text") OR ("organization_id" IN ( SELECT "ou"."organization_id"
   FROM "public"."organization_users" "ou"
  WHERE ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "contacts_insert_org_members" ON "public"."contacts" FOR INSERT WITH CHECK ((("auth"."role"() = 'service_role'::"text") OR ("organization_id" IN ( SELECT "ou"."organization_id"
   FROM "public"."organization_users" "ou"
  WHERE ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "contacts_members_all" ON "public"."contacts" USING ((("auth"."role"() = 'service_role'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."user_id" = "auth"."uid"()) AND ("ou"."organization_id" = "contacts"."organization_id")))))) WITH CHECK ((("auth"."role"() = 'service_role'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."user_id" = "auth"."uid"()) AND ("ou"."organization_id" = "contacts"."organization_id"))))));



CREATE POLICY "contacts_select_org_members" ON "public"."contacts" FOR SELECT USING ((("auth"."role"() = 'service_role'::"text") OR ("organization_id" IN ( SELECT "ou"."organization_id"
   FROM "public"."organization_users" "ou"
  WHERE ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "contacts_update_org_members" ON "public"."contacts" FOR UPDATE USING ((("auth"."role"() = 'service_role'::"text") OR ("organization_id" IN ( SELECT "ou"."organization_id"
   FROM "public"."organization_users" "ou"
  WHERE ("ou"."user_id" = "auth"."uid"()))))) WITH CHECK ((("auth"."role"() = 'service_role'::"text") OR ("organization_id" IN ( SELECT "ou"."organization_id"
   FROM "public"."organization_users" "ou"
  WHERE ("ou"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."conversation_state" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversation_state_select_org" ON "public"."conversation_state" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."conversations" "conv"
     JOIN "public"."organization_users" "ou" ON (("ou"."organization_id" = "conv"."organization_id")))
  WHERE (("conv"."id" = "conversation_state"."conversation_id") AND ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "conversation_state_write_service_role" ON "public"."conversation_state" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversations_members_all" ON "public"."conversations" USING ((("auth"."role"() = 'service_role'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."user_id" = "auth"."uid"()) AND ("ou"."organization_id" = "conversations"."organization_id")))))) WITH CHECK ((("auth"."role"() = 'service_role'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."user_id" = "auth"."uid"()) AND ("ou"."organization_id" = "conversations"."organization_id"))))));



ALTER TABLE "public"."knowledge_articles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "knowledge_articles_members_all" ON "public"."knowledge_articles" USING ((("auth"."role"() = 'service_role'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."user_id" = "auth"."uid"()) AND ("ou"."organization_id" = "knowledge_articles"."organization_id")))))) WITH CHECK ((("auth"."role"() = 'service_role'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."user_id" = "auth"."uid"()) AND ("ou"."organization_id" = "knowledge_articles"."organization_id"))))));



ALTER TABLE "public"."knowledge_chunks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "knowledge_chunks_select_members" ON "public"."knowledge_chunks" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "knowledge_chunks"."organization_id") AND ("ou"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."message_delivery_dlq" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "message_delivery_dlq_service_only" ON "public"."message_delivery_dlq" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."message_delivery_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "message_delivery_events_read_org" ON "public"."message_delivery_events" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."user_id" = "auth"."uid"()) AND ("ou"."organization_id" = "message_delivery_events"."organization_id")))));



CREATE POLICY "message_delivery_events_write_service_only" ON "public"."message_delivery_events" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages_members_all" ON "public"."messages" USING ((("auth"."role"() = 'service_role'::"text") OR (EXISTS ( SELECT 1
   FROM ("public"."conversations" "c"
     JOIN "public"."organization_users" "ou" ON (("ou"."organization_id" = "c"."organization_id")))
  WHERE (("c"."id" = "messages"."conversation_id") AND ("ou"."user_id" = "auth"."uid"())))))) WITH CHECK ((("auth"."role"() = 'service_role'::"text") OR (EXISTS ( SELECT 1
   FROM ("public"."conversations" "c"
     JOIN "public"."organization_users" "ou" ON (("ou"."organization_id" = "c"."organization_id")))
  WHERE (("c"."id" = "messages"."conversation_id") AND ("ou"."user_id" = "auth"."uid"()))))));



CREATE POLICY "org_admin_update" ON "public"."organizations" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users"
  WHERE (("organization_users"."organization_id" = "organizations"."id") AND ("organization_users"."user_id" = "auth"."uid"()) AND ("organization_users"."role" = 'admin'::"text")))));



CREATE POLICY "org_admin_update_bot_personality" ON "public"."bot_personality" FOR UPDATE USING (("organization_id" IN ( SELECT "organization_users"."organization_id"
   FROM "public"."organization_users"
  WHERE (("organization_users"."user_id" = "auth"."uid"()) AND (("organization_users"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR ("organization_users"."is_primary" = true)))))) WITH CHECK (("organization_id" IN ( SELECT "organization_users"."organization_id"
   FROM "public"."organization_users"
  WHERE (("organization_users"."user_id" = "auth"."uid"()) AND (("organization_users"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR ("organization_users"."is_primary" = true))))));



CREATE POLICY "org_members_can_manage_campaign_messages" ON "public"."campaign_messages" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "campaign_messages"."organization_id") AND ("ou"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "campaign_messages"."organization_id") AND ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_members_can_manage_campaigns" ON "public"."campaigns" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "campaigns"."organization_id") AND ("ou"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "campaigns"."organization_id") AND ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_members_manage_bot_instructions" ON "public"."bot_instructions" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "bot_instructions"."organization_id") AND ("ou"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "bot_instructions"."organization_id") AND ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_members_manage_bot_personality" ON "public"."bot_personality" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "bot_personality"."organization_id") AND ("ou"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "bot_personality"."organization_id") AND ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_members_manage_contacts" ON "public"."contacts" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "contacts"."organization_id") AND ("ou"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "contacts"."organization_id") AND ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_members_manage_conversations" ON "public"."conversations" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "conversations"."organization_id") AND ("ou"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "conversations"."organization_id") AND ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_members_manage_knowledge_articles" ON "public"."knowledge_articles" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "knowledge_articles"."organization_id") AND ("ou"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "knowledge_articles"."organization_id") AND ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_members_manage_messages" ON "public"."messages" USING ((EXISTS ( SELECT 1
   FROM ("public"."conversations" "c"
     JOIN "public"."organization_users" "ou" ON (("ou"."organization_id" = "c"."organization_id")))
  WHERE (("c"."id" = "messages"."conversation_id") AND ("ou"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."conversations" "c"
     JOIN "public"."organization_users" "ou" ON (("ou"."organization_id" = "c"."organization_id")))
  WHERE (("c"."id" = "messages"."conversation_id") AND ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_members_manage_unanswered_questions" ON "public"."unanswered_questions" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "unanswered_questions"."organization_id") AND ("ou"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "unanswered_questions"."organization_id") AND ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_members_manage_whatsapp_settings" ON "public"."whatsapp_settings" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "whatsapp_settings"."organization_id") AND ("ou"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "whatsapp_settings"."organization_id") AND ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_members_manage_workflow_logs" ON "public"."workflow_logs" USING ((EXISTS ( SELECT 1
   FROM ("public"."workflows" "w"
     JOIN "public"."organization_users" "ou" ON (("ou"."organization_id" = "w"."organization_id")))
  WHERE (("w"."id" = "workflow_logs"."workflow_id") AND ("ou"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."workflows" "w"
     JOIN "public"."organization_users" "ou" ON (("ou"."organization_id" = "w"."organization_id")))
  WHERE (("w"."id" = "workflow_logs"."workflow_id") AND ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_members_manage_workflow_steps" ON "public"."workflow_steps" USING ((EXISTS ( SELECT 1
   FROM ("public"."workflows" "w"
     JOIN "public"."organization_users" "ou" ON (("ou"."organization_id" = "w"."organization_id")))
  WHERE (("w"."id" = "workflow_steps"."workflow_id") AND ("ou"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."workflows" "w"
     JOIN "public"."organization_users" "ou" ON (("ou"."organization_id" = "w"."organization_id")))
  WHERE (("w"."id" = "workflow_steps"."workflow_id") AND ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_members_manage_workflows" ON "public"."workflows" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "workflows"."organization_id") AND ("ou"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "workflows"."organization_id") AND ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_members_modify_bot_personality" ON "public"."bot_personality" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "bot_personality"."organization_id") AND ("ou"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "bot_personality"."organization_id") AND ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_members_modify_campaign_messages" ON "public"."campaign_messages" USING ((EXISTS ( SELECT 1
   FROM ("public"."campaigns" "c"
     JOIN "public"."organization_users" "ou" ON (("ou"."organization_id" = "c"."organization_id")))
  WHERE (("c"."id" = "campaign_messages"."campaign_id") AND ("ou"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."campaigns" "c"
     JOIN "public"."organization_users" "ou" ON (("ou"."organization_id" = "c"."organization_id")))
  WHERE (("c"."id" = "campaign_messages"."campaign_id") AND ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_members_modify_campaigns" ON "public"."campaigns" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "campaigns"."organization_id") AND ("ou"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "campaigns"."organization_id") AND ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_members_modify_contacts" ON "public"."contacts" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "contacts"."organization_id") AND ("ou"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "contacts"."organization_id") AND ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_members_modify_conversations" ON "public"."conversations" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "conversations"."organization_id") AND ("ou"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "conversations"."organization_id") AND ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_members_modify_kb_articles" ON "public"."knowledge_articles" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "knowledge_articles"."organization_id") AND ("ou"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "knowledge_articles"."organization_id") AND ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_members_modify_messages" ON "public"."messages" USING ((EXISTS ( SELECT 1
   FROM ("public"."conversations" "c"
     JOIN "public"."organization_users" "ou" ON (("ou"."organization_id" = "c"."organization_id")))
  WHERE (("c"."id" = "messages"."conversation_id") AND ("ou"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."conversations" "c"
     JOIN "public"."organization_users" "ou" ON (("ou"."organization_id" = "c"."organization_id")))
  WHERE (("c"."id" = "messages"."conversation_id") AND ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_members_modify_unanswered" ON "public"."unanswered_questions" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "unanswered_questions"."organization_id") AND ("ou"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "unanswered_questions"."organization_id") AND ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_members_modify_wa_settings" ON "public"."whatsapp_settings" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "whatsapp_settings"."organization_id") AND ("ou"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "whatsapp_settings"."organization_id") AND ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_members_modify_workflows" ON "public"."workflows" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "workflows"."organization_id") AND ("ou"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "workflows"."organization_id") AND ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_members_read_razorpay_orders" ON "public"."razorpay_orders" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "razorpay_orders"."organization_id") AND ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_members_read_razorpay_payments" ON "public"."razorpay_payments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "razorpay_payments"."organization_id") AND ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_members_select_bot_personality" ON "public"."bot_personality" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "bot_personality"."organization_id") AND ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_members_select_campaign_messages" ON "public"."campaign_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."campaigns" "c"
     JOIN "public"."organization_users" "ou" ON (("ou"."organization_id" = "c"."organization_id")))
  WHERE (("c"."id" = "campaign_messages"."campaign_id") AND ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_members_select_campaigns" ON "public"."campaigns" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "campaigns"."organization_id") AND ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_members_select_contacts" ON "public"."contacts" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "contacts"."organization_id") AND ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_members_select_conversations" ON "public"."conversations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "conversations"."organization_id") AND ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_members_select_kb_articles" ON "public"."knowledge_articles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "knowledge_articles"."organization_id") AND ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_members_select_messages" ON "public"."messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."conversations" "c"
     JOIN "public"."organization_users" "ou" ON (("ou"."organization_id" = "c"."organization_id")))
  WHERE (("c"."id" = "messages"."conversation_id") AND ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_members_select_organizations" ON "public"."organizations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "organizations"."id") AND ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_members_select_unanswered" ON "public"."unanswered_questions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "unanswered_questions"."organization_id") AND ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_members_select_wa_settings" ON "public"."whatsapp_settings" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "whatsapp_settings"."organization_id") AND ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_members_select_whatsapp_templates" ON "public"."whatsapp_templates" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "whatsapp_templates"."organization_id") AND ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_members_select_workflows" ON "public"."workflows" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "workflows"."organization_id") AND ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_mod_service_role_only" ON "public"."organizations" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "org_select_visible_to_members" ON "public"."organizations" FOR SELECT USING ((("auth"."role"() = 'service_role'::"text") OR ("id" IN ( SELECT "ou"."organization_id"
   FROM "public"."organization_users" "ou"
  WHERE ("ou"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_users_mod_service_role_only" ON "public"."organization_users" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "org_users_select_self" ON "public"."organization_users" FOR SELECT USING ((("auth"."role"() = 'service_role'::"text") OR ("user_id" = "auth"."uid"())));



ALTER TABLE "public"."organization_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "psf insert org" ON "public"."psf_cases" FOR INSERT WITH CHECK (("organization_id" IN ( SELECT "organization_users"."organization_id"
   FROM "public"."organization_users"
  WHERE ("organization_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "psf read org" ON "public"."psf_cases" FOR SELECT USING (("organization_id" IN ( SELECT "organization_users"."organization_id"
   FROM "public"."organization_users"
  WHERE ("organization_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "psf update org" ON "public"."psf_cases" FOR UPDATE USING (("organization_id" IN ( SELECT "organization_users"."organization_id"
   FROM "public"."organization_users"
  WHERE ("organization_users"."user_id" = "auth"."uid"())))) WITH CHECK (("organization_id" IN ( SELECT "organization_users"."organization_id"
   FROM "public"."organization_users"
  WHERE ("organization_users"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."psf_cases" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "psf_cases_org_access" ON "public"."psf_cases" USING (("organization_id" = (("auth"."jwt"() ->> 'organization_id'::"text"))::"uuid"));



CREATE POLICY "psf_cases_org_read" ON "public"."psf_cases" FOR SELECT USING (("organization_id" IN ( SELECT "organization_users"."organization_id"
   FROM "public"."organization_users"
  WHERE ("organization_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "psf_cases_org_write" ON "public"."psf_cases" FOR UPDATE USING (("organization_id" IN ( SELECT "organization_users"."organization_id"
   FROM "public"."organization_users"
  WHERE ("organization_users"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."razorpay_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."razorpay_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."replay_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "replay_requests_insert_org" ON "public"."replay_requests" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."user_id" = "auth"."uid"()) AND ("ou"."organization_id" = "replay_requests"."organization_id")))));



CREATE POLICY "replay_requests_read_org" ON "public"."replay_requests" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."user_id" = "auth"."uid"()) AND ("ou"."organization_id" = "replay_requests"."organization_id")))));



CREATE POLICY "replay_requests_update_service_only" ON "public"."replay_requests" FOR UPDATE USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service role can manage knowledge chunks" ON "public"."knowledge_chunks" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service role read" ON "public"."knowledge_articles" FOR SELECT TO "service_role" USING (true);



CREATE POLICY "service_role_insert_wallet_txn" ON "public"."wallet_transactions" FOR INSERT WITH CHECK (true);



CREATE POLICY "service_role_kb_chunks" ON "public"."knowledge_chunks" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."unanswered_questions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "unanswered_questions_org_access" ON "public"."unanswered_questions" USING ((EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "unanswered_questions"."conversation_id") AND ("c"."organization_id" = (("auth"."jwt"() ->> 'organization_id'::"text"))::"uuid")))));



CREATE POLICY "user_delete_own_org_membership" ON "public"."organization_users" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user_insert_own_org_membership" ON "public"."organization_users" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "user_select_own_org_membership" ON "public"."organization_users" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user_update_own_org_membership" ON "public"."organization_users" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "wa_settings_mod_service_role_only" ON "public"."whatsapp_settings" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."wallet_alert_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wallet_alert_logs_org_access" ON "public"."wallet_alert_logs" USING ((EXISTS ( SELECT 1
   FROM "public"."wallets" "w"
  WHERE (("w"."id" = "wallet_alert_logs"."wallet_id") AND ("w"."organization_id" = (("auth"."jwt"() ->> 'organization_id'::"text"))::"uuid")))));



CREATE POLICY "wallet_alert_logs_select_org" ON "public"."wallet_alert_logs" FOR SELECT TO "authenticated" USING (("organization_id" IN ( SELECT "ou"."organization_id"
   FROM "public"."organization_users" "ou"
  WHERE ("ou"."user_id" = "auth"."uid"()))));



CREATE POLICY "wallet_alert_logs_update_org" ON "public"."wallet_alert_logs" FOR UPDATE TO "authenticated" USING (("organization_id" IN ( SELECT "ou"."organization_id"
   FROM "public"."organization_users" "ou"
  WHERE ("ou"."user_id" = "auth"."uid"())))) WITH CHECK (("organization_id" IN ( SELECT "ou"."organization_id"
   FROM "public"."organization_users" "ou"
  WHERE ("ou"."user_id" = "auth"."uid"()))));



CREATE POLICY "wallet_alert_logs_write_service_role" ON "public"."wallet_alert_logs" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."wallet_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wallet_transactions_read" ON "public"."wallet_transactions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."wallets" "w"
     JOIN "public"."organization_users" "ou" ON (("ou"."organization_id" = "w"."organization_id")))
  WHERE (("w"."id" = "wallet_transactions"."wallet_id") AND ("ou"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."wallets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wallets_members_read" ON "public"."wallets" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."user_id" = "auth"."uid"()) AND ("ou"."organization_id" = "wallets"."organization_id")))));



CREATE POLICY "wallets_read" ON "public"."wallets" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "wallets"."organization_id") AND ("ou"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."whatsapp_bulk_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "whatsapp_bulk_logs_select_org" ON "public"."whatsapp_bulk_logs" FOR SELECT TO "authenticated" USING (("organization_id" IN ( SELECT "ou"."organization_id"
   FROM "public"."organization_users" "ou"
  WHERE ("ou"."user_id" = "auth"."uid"()))));



CREATE POLICY "whatsapp_bulk_logs_write_service_role" ON "public"."whatsapp_bulk_logs" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."whatsapp_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "whatsapp_settings_members_all" ON "public"."whatsapp_settings" USING ((("auth"."role"() = 'service_role'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."user_id" = "auth"."uid"()) AND ("ou"."organization_id" = "whatsapp_settings"."organization_id")))))) WITH CHECK ((("auth"."role"() = 'service_role'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."user_id" = "auth"."uid"()) AND ("ou"."organization_id" = "whatsapp_settings"."organization_id"))))));



ALTER TABLE "public"."whatsapp_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "whatsapp_templates_members_all" ON "public"."whatsapp_templates" USING ((("auth"."role"() = 'service_role'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."user_id" = "auth"."uid"()) AND ("ou"."organization_id" = "whatsapp_templates"."organization_id")))))) WITH CHECK ((("auth"."role"() = 'service_role'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."user_id" = "auth"."uid"()) AND ("ou"."organization_id" = "whatsapp_templates"."organization_id"))))));



ALTER TABLE "public"."workflow_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workflow_logs_members_all" ON "public"."workflow_logs" USING ((EXISTS ( SELECT 1
   FROM ("public"."workflows" "w"
     JOIN "public"."organization_users" "ou" ON (("ou"."organization_id" = "w"."organization_id")))
  WHERE (("w"."id" = "workflow_logs"."workflow_id") AND ("ou"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."workflows" "w"
     JOIN "public"."organization_users" "ou" ON (("ou"."organization_id" = "w"."organization_id")))
  WHERE (("w"."id" = "workflow_logs"."workflow_id") AND ("ou"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."workflow_steps" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workflow_steps_members_all" ON "public"."workflow_steps" USING ((EXISTS ( SELECT 1
   FROM ("public"."workflows" "w"
     JOIN "public"."organization_users" "ou" ON (("ou"."organization_id" = "w"."organization_id")))
  WHERE (("w"."id" = "workflow_steps"."workflow_id") AND ("ou"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."workflows" "w"
     JOIN "public"."organization_users" "ou" ON (("ou"."organization_id" = "w"."organization_id")))
  WHERE (("w"."id" = "workflow_steps"."workflow_id") AND ("ou"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."workflows" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workflows_members_all" ON "public"."workflows" USING ((("auth"."role"() = 'service_role'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."user_id" = "auth"."uid"()) AND ("ou"."organization_id" = "workflows"."organization_id")))))) WITH CHECK ((("auth"."role"() = 'service_role'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."user_id" = "auth"."uid"()) AND ("ou"."organization_id" = "workflows"."organization_id"))))));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."conversations";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."messages";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "service_role";





































































































































































GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."bytea_to_text"("data" "bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."bytea_to_text"("data" "bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."bytea_to_text"("data" "bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bytea_to_text"("data" "bytea") TO "service_role";



GRANT ALL ON TABLE "public"."campaign_messages" TO "anon";
GRANT ALL ON TABLE "public"."campaign_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_messages" TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_campaign_messages"("p_campaign_id" "uuid", "p_limit" integer, "p_worker_id" "text", "p_lock_ttl_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_campaign_messages"("p_campaign_id" "uuid", "p_limit" integer, "p_worker_id" "text", "p_lock_ttl_seconds" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."claim_campaign_messages"("p_campaign_id" "uuid", "p_limit" integer, "p_worker_id" "text", "p_lock_ttl_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_campaign_messages"("p_campaign_id" "uuid", "p_limit" integer, "p_worker_id" "text", "p_lock_ttl_seconds" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_psf_case_on_campaign_message"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_psf_case_on_campaign_message"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_psf_case_on_campaign_message"() TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "postgres";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "anon";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "authenticated";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."http"("request" "public"."http_request") TO "postgres";
GRANT ALL ON FUNCTION "public"."http"("request" "public"."http_request") TO "anon";
GRANT ALL ON FUNCTION "public"."http"("request" "public"."http_request") TO "authenticated";
GRANT ALL ON FUNCTION "public"."http"("request" "public"."http_request") TO "service_role";



GRANT ALL ON FUNCTION "public"."http_delete"("uri" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."http_delete"("uri" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."http_delete"("uri" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_delete"("uri" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."http_delete"("uri" character varying, "content" character varying, "content_type" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."http_delete"("uri" character varying, "content" character varying, "content_type" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."http_delete"("uri" character varying, "content" character varying, "content_type" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_delete"("uri" character varying, "content" character varying, "content_type" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."http_get"("uri" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."http_get"("uri" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."http_get"("uri" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_get"("uri" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."http_get"("uri" character varying, "data" "jsonb") TO "postgres";
GRANT ALL ON FUNCTION "public"."http_get"("uri" character varying, "data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."http_get"("uri" character varying, "data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_get"("uri" character varying, "data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."http_head"("uri" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."http_head"("uri" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."http_head"("uri" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_head"("uri" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."http_header"("field" character varying, "value" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."http_header"("field" character varying, "value" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."http_header"("field" character varying, "value" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_header"("field" character varying, "value" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."http_list_curlopt"() TO "postgres";
GRANT ALL ON FUNCTION "public"."http_list_curlopt"() TO "anon";
GRANT ALL ON FUNCTION "public"."http_list_curlopt"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_list_curlopt"() TO "service_role";



GRANT ALL ON FUNCTION "public"."http_patch"("uri" character varying, "content" character varying, "content_type" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."http_patch"("uri" character varying, "content" character varying, "content_type" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."http_patch"("uri" character varying, "content" character varying, "content_type" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_patch"("uri" character varying, "content" character varying, "content_type" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."http_post"("uri" character varying, "data" "jsonb") TO "postgres";
GRANT ALL ON FUNCTION "public"."http_post"("uri" character varying, "data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."http_post"("uri" character varying, "data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_post"("uri" character varying, "data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."http_post"("uri" character varying, "content" character varying, "content_type" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."http_post"("uri" character varying, "content" character varying, "content_type" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."http_post"("uri" character varying, "content" character varying, "content_type" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_post"("uri" character varying, "content" character varying, "content_type" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."http_put"("uri" character varying, "content" character varying, "content_type" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."http_put"("uri" character varying, "content" character varying, "content_type" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."http_put"("uri" character varying, "content" character varying, "content_type" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_put"("uri" character varying, "content" character varying, "content_type" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."http_reset_curlopt"() TO "postgres";
GRANT ALL ON FUNCTION "public"."http_reset_curlopt"() TO "anon";
GRANT ALL ON FUNCTION "public"."http_reset_curlopt"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_reset_curlopt"() TO "service_role";



GRANT ALL ON FUNCTION "public"."http_set_curlopt"("curlopt" character varying, "value" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."http_set_curlopt"("curlopt" character varying, "value" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."http_set_curlopt"("curlopt" character varying, "value" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_set_curlopt"("curlopt" character varying, "value" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "postgres";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "anon";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "authenticated";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."match_knowledge_chunks"("query_embedding" "public"."vector", "match_count" integer, "match_threshold" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."match_knowledge_chunks"("query_embedding" "public"."vector", "match_count" integer, "match_threshold" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_knowledge_chunks"("query_embedding" "public"."vector", "match_count" integer, "match_threshold" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."match_knowledge_chunks"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."match_knowledge_chunks"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_knowledge_chunks"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "org_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."match_knowledge_chunks"("query_embedding" "public"."vector", "match_count" integer, "match_threshold" double precision, "p_organization_id" "uuid", "p_only_published" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_knowledge_chunks"("query_embedding" "public"."vector", "match_count" integer, "match_threshold" double precision, "p_organization_id" "uuid", "p_only_published" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."match_knowledge_chunks_scoped"("query_embedding" "public"."vector", "p_organization_id" "uuid", "match_count" integer, "match_threshold" double precision, "p_only_published" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_knowledge_chunks_scoped"("query_embedding" "public"."vector", "p_organization_id" "uuid", "match_count" integer, "match_threshold" double precision, "p_only_published" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."phase5_create_wallet_for_org"() TO "anon";
GRANT ALL ON FUNCTION "public"."phase5_create_wallet_for_org"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."phase5_create_wallet_for_org"() TO "service_role";



GRANT ALL ON FUNCTION "public"."phase5_wallet_apply_transaction"() TO "anon";
GRANT ALL ON FUNCTION "public"."phase5_wallet_apply_transaction"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."phase5_wallet_apply_transaction"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."phase5_wallet_manual_credit"("p_organization_id" "uuid", "p_amount" numeric, "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."phase5_wallet_manual_credit"("p_organization_id" "uuid", "p_amount" numeric, "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."phase5_wallet_manual_credit"("p_organization_id" "uuid", "p_amount" numeric, "p_note" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."phase5_wallet_prevent_negative_balance"() TO "anon";
GRANT ALL ON FUNCTION "public"."phase5_wallet_prevent_negative_balance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."phase5_wallet_prevent_negative_balance"() TO "service_role";



GRANT ALL ON FUNCTION "public"."phase6_log_unanswered_question"("p_organization_id" "uuid", "p_conversation_id" "uuid", "p_channel" "text", "p_user_message" "text", "p_ai_response" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."phase6_log_unanswered_question"("p_organization_id" "uuid", "p_conversation_id" "uuid", "p_channel" "text", "p_user_message" "text", "p_ai_response" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."phase6_log_unanswered_question"("p_organization_id" "uuid", "p_conversation_id" "uuid", "p_channel" "text", "p_user_message" "text", "p_ai_response" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_active_organization"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_active_organization"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."set_active_organization"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_active_organization"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_message_order_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_message_order_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_message_order_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_message_organization_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_message_organization_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_message_organization_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_unanswered_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_unanswered_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_unanswered_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."text_to_bytea"("data" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."text_to_bytea"("data" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."text_to_bytea"("data" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."text_to_bytea"("data" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_psf_cases_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_psf_cases_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_psf_cases_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."urlencode"("string" "bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."urlencode"("string" "bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."urlencode"("string" "bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."urlencode"("string" "bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."urlencode"("data" "jsonb") TO "postgres";
GRANT ALL ON FUNCTION "public"."urlencode"("data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."urlencode"("data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."urlencode"("data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."urlencode"("string" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."urlencode"("string" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."urlencode"("string" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."urlencode"("string" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "service_role";












GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "service_role";









GRANT ALL ON TABLE "public"."ai_turn_traces" TO "anon";
GRANT ALL ON TABLE "public"."ai_turn_traces" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_turn_traces" TO "service_role";



GRANT ALL ON TABLE "public"."ai_failures_last_24h_view" TO "anon";
GRANT ALL ON TABLE "public"."ai_failures_last_24h_view" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_failures_last_24h_view" TO "service_role";



GRANT ALL ON TABLE "public"."ai_settings" TO "anon";
GRANT ALL ON TABLE "public"."ai_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_settings" TO "service_role";



GRANT ALL ON TABLE "public"."ai_usage_logs" TO "anon";
GRANT ALL ON TABLE "public"."ai_usage_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_usage_logs" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."bot_instructions" TO "anon";
GRANT ALL ON TABLE "public"."bot_instructions" TO "authenticated";
GRANT ALL ON TABLE "public"."bot_instructions" TO "service_role";



GRANT ALL ON TABLE "public"."bot_personality" TO "anon";
GRANT ALL ON TABLE "public"."bot_personality" TO "authenticated";
GRANT ALL ON TABLE "public"."bot_personality" TO "service_role";



GRANT ALL ON TABLE "public"."campaigns" TO "anon";
GRANT ALL ON TABLE "public"."campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_analytics_summary" TO "anon";
GRANT ALL ON TABLE "public"."campaign_analytics_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_analytics_summary" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_analytics_summary_v2" TO "anon";
GRANT ALL ON TABLE "public"."campaign_analytics_summary_v2" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_analytics_summary_v2" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_delivery_import" TO "anon";
GRANT ALL ON TABLE "public"."campaign_delivery_import" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_delivery_import" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_delivery_receipt_failures" TO "anon";
GRANT ALL ON TABLE "public"."campaign_delivery_receipt_failures" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_delivery_receipt_failures" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_message_status_summary" TO "anon";
GRANT ALL ON TABLE "public"."campaign_message_status_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_message_status_summary" TO "service_role";



GRANT ALL ON TABLE "public"."contacts" TO "anon";
GRANT ALL ON TABLE "public"."contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."contacts" TO "service_role";



GRANT ALL ON TABLE "public"."contact_campaign_summary" TO "anon";
GRANT ALL ON TABLE "public"."contact_campaign_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_campaign_summary" TO "service_role";



GRANT ALL ON TABLE "public"."contact_uploads" TO "anon";
GRANT ALL ON TABLE "public"."contact_uploads" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_uploads" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_state" TO "anon";
GRANT ALL ON TABLE "public"."conversation_state" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_state" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."message_delivery_events" TO "anon";
GRANT ALL ON TABLE "public"."message_delivery_events" TO "authenticated";
GRANT ALL ON TABLE "public"."message_delivery_events" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_failures_last_24h_view" TO "anon";
GRANT ALL ON TABLE "public"."delivery_failures_last_24h_view" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_failures_last_24h_view" TO "service_role";



GRANT ALL ON TABLE "public"."failure_reason_summary" TO "anon";
GRANT ALL ON TABLE "public"."failure_reason_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."failure_reason_summary" TO "service_role";



GRANT ALL ON TABLE "public"."knowledge_articles" TO "anon";
GRANT ALL ON TABLE "public"."knowledge_articles" TO "authenticated";
GRANT ALL ON TABLE "public"."knowledge_articles" TO "service_role";



GRANT ALL ON TABLE "public"."knowledge_chunks" TO "service_role";
GRANT SELECT ON TABLE "public"."knowledge_chunks" TO "authenticated";



GRANT ALL ON TABLE "public"."message_delivery_dlq" TO "anon";
GRANT ALL ON TABLE "public"."message_delivery_dlq" TO "authenticated";
GRANT ALL ON TABLE "public"."message_delivery_dlq" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."model_analytics_summary" TO "anon";
GRANT ALL ON TABLE "public"."model_analytics_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."model_analytics_summary" TO "service_role";



GRANT ALL ON TABLE "public"."organization_users" TO "anon";
GRANT ALL ON TABLE "public"."organization_users" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_users" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."psf_cases" TO "anon";
GRANT ALL ON TABLE "public"."psf_cases" TO "authenticated";
GRANT ALL ON TABLE "public"."psf_cases" TO "service_role";



GRANT ALL ON TABLE "public"."psf_cases_view" TO "anon";
GRANT ALL ON TABLE "public"."psf_cases_view" TO "authenticated";
GRANT ALL ON TABLE "public"."psf_cases_view" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."razorpay_orders" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."razorpay_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."razorpay_orders" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."razorpay_payments" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."razorpay_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."razorpay_payments" TO "service_role";



GRANT ALL ON TABLE "public"."replay_requests" TO "anon";
GRANT ALL ON TABLE "public"."replay_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."replay_requests" TO "service_role";



GRANT ALL ON TABLE "public"."stuck_campaign_messages_view" TO "anon";
GRANT ALL ON TABLE "public"."stuck_campaign_messages_view" TO "authenticated";
GRANT ALL ON TABLE "public"."stuck_campaign_messages_view" TO "service_role";



GRANT ALL ON TABLE "public"."template_analytics_summary" TO "anon";
GRANT ALL ON TABLE "public"."template_analytics_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."template_analytics_summary" TO "service_role";



GRANT ALL ON TABLE "public"."template_analytics_summary_v2" TO "anon";
GRANT ALL ON TABLE "public"."template_analytics_summary_v2" TO "authenticated";
GRANT ALL ON TABLE "public"."template_analytics_summary_v2" TO "service_role";



GRANT ALL ON TABLE "public"."unanswered_questions" TO "anon";
GRANT ALL ON TABLE "public"."unanswered_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."unanswered_questions" TO "service_role";



GRANT ALL ON TABLE "public"."user_active_organization" TO "anon";
GRANT ALL ON TABLE "public"."user_active_organization" TO "authenticated";
GRANT ALL ON TABLE "public"."user_active_organization" TO "service_role";



GRANT ALL ON TABLE "public"."wallet_alert_logs" TO "anon";
GRANT ALL ON TABLE "public"."wallet_alert_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."wallet_alert_logs" TO "service_role";



GRANT ALL ON TABLE "public"."wallet_transactions" TO "anon";
GRANT ALL ON TABLE "public"."wallet_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."wallet_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."wallets" TO "anon";
GRANT ALL ON TABLE "public"."wallets" TO "authenticated";
GRANT ALL ON TABLE "public"."wallets" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_bulk_logs" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_bulk_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_bulk_logs" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_overview_daily_v1" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_overview_daily_v1" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_overview_daily_v1" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_settings" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_settings" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_templates" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_templates" TO "service_role";



GRANT ALL ON TABLE "public"."workflow_logs" TO "anon";
GRANT ALL ON TABLE "public"."workflow_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_logs" TO "service_role";



GRANT ALL ON TABLE "public"."workflow_steps" TO "anon";
GRANT ALL ON TABLE "public"."workflow_steps" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_steps" TO "service_role";



GRANT ALL ON TABLE "public"."workflows" TO "anon";
GRANT ALL ON TABLE "public"."workflows" TO "authenticated";
GRANT ALL ON TABLE "public"."workflows" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";

drop extension if exists "pg_stat_statements";

create extension if not exists "pg_net" with schema "public";

revoke delete on table "public"."knowledge_chunks" from "anon";

revoke insert on table "public"."knowledge_chunks" from "anon";

revoke references on table "public"."knowledge_chunks" from "anon";

revoke select on table "public"."knowledge_chunks" from "anon";

revoke trigger on table "public"."knowledge_chunks" from "anon";

revoke truncate on table "public"."knowledge_chunks" from "anon";

revoke update on table "public"."knowledge_chunks" from "anon";

revoke delete on table "public"."knowledge_chunks" from "authenticated";

revoke insert on table "public"."knowledge_chunks" from "authenticated";

revoke references on table "public"."knowledge_chunks" from "authenticated";

revoke trigger on table "public"."knowledge_chunks" from "authenticated";

revoke truncate on table "public"."knowledge_chunks" from "authenticated";

revoke update on table "public"."knowledge_chunks" from "authenticated";

revoke delete on table "public"."razorpay_orders" from "anon";

revoke insert on table "public"."razorpay_orders" from "anon";

revoke update on table "public"."razorpay_orders" from "anon";

revoke delete on table "public"."razorpay_orders" from "authenticated";

revoke insert on table "public"."razorpay_orders" from "authenticated";

revoke update on table "public"."razorpay_orders" from "authenticated";

revoke delete on table "public"."razorpay_payments" from "anon";

revoke insert on table "public"."razorpay_payments" from "anon";

revoke update on table "public"."razorpay_payments" from "anon";

revoke delete on table "public"."razorpay_payments" from "authenticated";

revoke insert on table "public"."razorpay_payments" from "authenticated";

revoke update on table "public"."razorpay_payments" from "authenticated";


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



