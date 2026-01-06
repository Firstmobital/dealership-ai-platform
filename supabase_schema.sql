


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


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."campaign_message_status" AS ENUM (
    'pending',
    'queued',
    'sent',
    'delivered',
    'failed',
    'cancelled'
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
    'customer'
);


ALTER TYPE "public"."message_sender" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_knowledge_chunks"("query_embedding" "public"."vector", "match_count" integer DEFAULT 20, "match_threshold" double precision DEFAULT 0.3) RETURNS TABLE("id" "uuid", "article_id" "uuid", "chunk" "text", "similarity" double precision)
    LANGUAGE "plpgsql"
    AS $$
begin
  return query
  select
    kc.id,
    kc.article_id,
    kc.chunk,
    1 - (kc.embedding <=> query_embedding) as similarity
  from knowledge_chunks kc
  where 1 - (kc.embedding <=> query_embedding) > match_threshold
  order by kc.embedding <=> query_embedding
  limit match_count;
end;
$$;


ALTER FUNCTION "public"."match_knowledge_chunks"("query_embedding" "public"."vector", "match_count" integer, "match_threshold" double precision) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."bot_instructions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
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
    "fallback_message" "text" DEFAULT 'Let me connect you with an advisor.'::"text" NOT NULL
);


ALTER TABLE "public"."bot_personality" OWNER TO "postgres";


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
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."campaign_messages" OWNER TO "postgres";


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
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."campaigns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "phone" "text" NOT NULL,
    "name" "text",
    "labels" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "contact_id" "uuid",
    "assigned_to" "uuid",
    "ai_enabled" boolean DEFAULT true,
    "channel" "text" DEFAULT 'web'::"text" NOT NULL,
    "last_message_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "conversations_channel_check" CHECK (("channel" = ANY (ARRAY['web'::"text", 'whatsapp'::"text", 'internal'::"text"])))
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."knowledge_articles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "sub_organization_id" "uuid"
);


ALTER TABLE "public"."knowledge_articles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."knowledge_chunks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "article_id" "uuid",
    "chunk" "text" NOT NULL,
    "embedding" "public"."vector"(1536),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."knowledge_chunks" OWNER TO "postgres";


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
    CONSTRAINT "messages_channel_check" CHECK (("channel" = ANY (ARRAY['web'::"text", 'whatsapp'::"text", 'internal'::"text"])))
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'agent'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "organization_users_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'agent'::"text"])))
);


ALTER TABLE "public"."organization_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "logo_url" "text",
    "type" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "parent_org_id" "uuid"
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."unanswered_questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "question" "text" NOT NULL,
    "occurrences" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."unanswered_questions" OWNER TO "postgres";


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
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "sub_organization_id" "uuid"
);


ALTER TABLE "public"."whatsapp_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workflow_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workflow_id" "uuid",
    "conversation_id" "uuid",
    "step_id" "uuid",
    "data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."workflow_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workflow_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workflow_id" "uuid",
    "step_order" integer NOT NULL,
    "action" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."workflow_steps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workflows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "trigger" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."workflows" OWNER TO "postgres";


ALTER TABLE ONLY "public"."bot_instructions"
    ADD CONSTRAINT "bot_instructions_organization_id_key" UNIQUE ("organization_id");



ALTER TABLE ONLY "public"."bot_instructions"
    ADD CONSTRAINT "bot_instructions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bot_personality"
    ADD CONSTRAINT "bot_personality_pkey" PRIMARY KEY ("organization_id");



ALTER TABLE ONLY "public"."campaign_messages"
    ADD CONSTRAINT "campaign_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."knowledge_articles"
    ADD CONSTRAINT "knowledge_articles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."knowledge_chunks"
    ADD CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_users"
    ADD CONSTRAINT "organization_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."unanswered_questions"
    ADD CONSTRAINT "unanswered_questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_settings"
    ADD CONSTRAINT "unique_whatsapp_settings_org_sub" UNIQUE ("organization_id", "sub_organization_id");



ALTER TABLE ONLY "public"."whatsapp_settings"
    ADD CONSTRAINT "whatsapp_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflow_logs"
    ADD CONSTRAINT "workflow_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflow_steps"
    ADD CONSTRAINT "workflow_steps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflows"
    ADD CONSTRAINT "workflows_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_campaign_messages_campaign" ON "public"."campaign_messages" USING "btree" ("campaign_id");



CREATE INDEX "idx_campaign_messages_org_status" ON "public"."campaign_messages" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_campaign_messages_send_queue" ON "public"."campaign_messages" USING "btree" ("status", "campaign_id", "created_at");



CREATE INDEX "idx_campaigns_org" ON "public"."campaigns" USING "btree" ("organization_id");



CREATE INDEX "idx_campaigns_org_status" ON "public"."campaigns" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_campaigns_scheduled_at" ON "public"."campaigns" USING "btree" ("status", "scheduled_at");



CREATE INDEX "idx_chunks_article" ON "public"."knowledge_chunks" USING "btree" ("article_id");



CREATE INDEX "idx_chunks_embedding" ON "public"."knowledge_chunks" USING "hnsw" ("embedding" "public"."vector_cosine_ops");



CREATE UNIQUE INDEX "uniq_messages_whatsapp_message_id" ON "public"."messages" USING "btree" ("whatsapp_message_id") WHERE ("whatsapp_message_id" IS NOT NULL);



CREATE UNIQUE INDEX "unique_wa_settings_per_org_or_suborg" ON "public"."whatsapp_settings" USING "btree" ("organization_id", "sub_organization_id");



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



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."knowledge_chunks"
    ADD CONSTRAINT "fk_chunks_article" FOREIGN KEY ("article_id") REFERENCES "public"."knowledge_articles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."knowledge_articles"
    ADD CONSTRAINT "knowledge_articles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."knowledge_articles"
    ADD CONSTRAINT "knowledge_articles_sub_organization_id_fkey" FOREIGN KEY ("sub_organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_users"
    ADD CONSTRAINT "organization_users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_parent_org_id_fkey" FOREIGN KEY ("parent_org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."unanswered_questions"
    ADD CONSTRAINT "unanswered_questions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_settings"
    ADD CONSTRAINT "whatsapp_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_settings"
    ADD CONSTRAINT "whatsapp_settings_sub_organization_id_fkey" FOREIGN KEY ("sub_organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workflow_logs"
    ADD CONSTRAINT "workflow_logs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workflow_logs"
    ADD CONSTRAINT "workflow_logs_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "public"."workflow_steps"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workflow_logs"
    ADD CONSTRAINT "workflow_logs_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflow_steps"
    ADD CONSTRAINT "workflow_steps_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflows"
    ADD CONSTRAINT "workflows_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE "public"."bot_instructions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bot_personality" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaign_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaigns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."knowledge_articles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."knowledge_chunks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


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



CREATE POLICY "org_members_insert_sub_orgs" ON "public"."organizations" FOR INSERT WITH CHECK ((("parent_org_id" IS NOT NULL) AND ("auth"."uid"() IN ( SELECT "ou"."user_id"
   FROM "public"."organization_users" "ou"
  WHERE ("ou"."organization_id" = "organizations"."parent_org_id")))));



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



CREATE POLICY "org_members_manage_knowledge_chunks" ON "public"."knowledge_chunks" USING ((EXISTS ( SELECT 1
   FROM ("public"."knowledge_articles" "ka"
     JOIN "public"."organization_users" "ou" ON (("ou"."organization_id" = "ka"."organization_id")))
  WHERE (("ka"."id" = "knowledge_chunks"."article_id") AND ("ou"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."knowledge_articles" "ka"
     JOIN "public"."organization_users" "ou" ON (("ou"."organization_id" = "ka"."organization_id")))
  WHERE (("ka"."id" = "knowledge_chunks"."article_id") AND ("ou"."user_id" = "auth"."uid"())))));



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



CREATE POLICY "org_members_view_sub_orgs" ON "public"."organizations" FOR SELECT USING (("auth"."uid"() IN ( SELECT "ou"."user_id"
   FROM "public"."organization_users" "ou"
  WHERE (("ou"."organization_id" = "organizations"."id") OR ("ou"."organization_id" = "organizations"."parent_org_id")))));



ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."unanswered_questions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workflow_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workflow_steps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workflows" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."match_knowledge_chunks"("query_embedding" "public"."vector", "match_count" integer, "match_threshold" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."match_knowledge_chunks"("query_embedding" "public"."vector", "match_count" integer, "match_threshold" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_knowledge_chunks"("query_embedding" "public"."vector", "match_count" integer, "match_threshold" double precision) TO "service_role";



GRANT ALL ON TABLE "public"."bot_instructions" TO "anon";
GRANT ALL ON TABLE "public"."bot_instructions" TO "authenticated";
GRANT ALL ON TABLE "public"."bot_instructions" TO "service_role";



GRANT ALL ON TABLE "public"."bot_personality" TO "anon";
GRANT ALL ON TABLE "public"."bot_personality" TO "authenticated";
GRANT ALL ON TABLE "public"."bot_personality" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_messages" TO "anon";
GRANT ALL ON TABLE "public"."campaign_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_messages" TO "service_role";



GRANT ALL ON TABLE "public"."campaigns" TO "anon";
GRANT ALL ON TABLE "public"."campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."contacts" TO "anon";
GRANT ALL ON TABLE "public"."contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."contacts" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."knowledge_articles" TO "anon";
GRANT ALL ON TABLE "public"."knowledge_articles" TO "authenticated";
GRANT ALL ON TABLE "public"."knowledge_articles" TO "service_role";



GRANT ALL ON TABLE "public"."knowledge_chunks" TO "anon";
GRANT ALL ON TABLE "public"."knowledge_chunks" TO "authenticated";
GRANT ALL ON TABLE "public"."knowledge_chunks" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."organization_users" TO "anon";
GRANT ALL ON TABLE "public"."organization_users" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_users" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."unanswered_questions" TO "anon";
GRANT ALL ON TABLE "public"."unanswered_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."unanswered_questions" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_settings" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_settings" TO "service_role";



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







