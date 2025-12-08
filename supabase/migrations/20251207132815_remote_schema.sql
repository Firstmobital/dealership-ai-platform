drop extension if exists "pg_net";

drop extension if exists "pg_stat_statements";

drop policy "org_members_manage_knowledge_chunks" on "public"."knowledge_chunks";

alter table "public"."bot_instructions" drop constraint "bot_instructions_org_suborg_key";

alter table "public"."bot_personality" drop constraint "bot_personality_org_suborg_key";

alter table "public"."knowledge_chunks" drop constraint "knowledge_chunks_sub_organization_id_fkey";

drop index if exists "public"."bot_instructions_org_suborg_key";

drop index if exists "public"."bot_personality_org_suborg_key";

drop index if exists "public"."idx_chunks_embedding";

alter table "public"."conversations" add column "whatsapp_user_phone" text;

alter table "public"."knowledge_chunks" drop column "sub_organization_id";

alter table "public"."knowledge_chunks" alter column "article_id" set not null;

alter table "public"."sub_organizations" alter column "slug" drop not null;

alter table "public"."workflow_logs" add column "completed" boolean not null default false;

alter table "public"."workflow_logs" add column "current_step_number" integer;

alter table "public"."workflow_logs" add column "variables" jsonb default '{}'::jsonb;

alter table "public"."workflow_steps" add column "ai_action" text not null default 'give_information'::text;

alter table "public"."workflow_steps" add column "expected_user_input" text;

alter table "public"."workflow_steps" add column "instruction_text" text;

alter table "public"."workflow_steps" add column "metadata" jsonb default '{}'::jsonb;

alter table "public"."workflows" add column "is_active" boolean not null default true;

alter table "public"."workflows" add column "mode" text not null default 'strict'::text;

alter table "public"."workflows" add column "sub_organization_id" uuid;

alter table "public"."workflows" add column "trigger_type" text not null default 'keyword'::text;

CREATE UNIQUE INDEX bot_instructions_organization_id_key ON public.bot_instructions USING btree (organization_id);

CREATE INDEX idx_workflow_logs_conversation_active ON public.workflow_logs USING btree (conversation_id, completed);

CREATE INDEX idx_workflow_logs_workflow ON public.workflow_logs USING btree (workflow_id);

CREATE INDEX idx_workflows_org_suborg ON public.workflows USING btree (organization_id, sub_organization_id);

CREATE INDEX knowledge_chunks_article_idx ON public.knowledge_chunks USING btree (article_id);

CREATE INDEX knowledge_chunks_embedding_idx ON public.knowledge_chunks USING ivfflat (embedding public.vector_cosine_ops) WITH (lists='100');

CREATE UNIQUE INDEX whatsapp_settings_org_suborg_unique ON public.whatsapp_settings USING btree (organization_id, sub_organization_id);

alter table "public"."bot_instructions" add constraint "bot_instructions_organization_id_key" UNIQUE using index "bot_instructions_organization_id_key";

alter table "public"."whatsapp_settings" add constraint "uniq_whatsapp_settings_scope" UNIQUE using index "uniq_whatsapp_settings_scope";

alter table "public"."workflow_steps" add constraint "workflow_steps_ai_action_check" CHECK ((ai_action = ANY (ARRAY['ask_question'::text, 'give_information'::text, 'use_knowledge_base'::text, 'save_user_response'::text, 'branch'::text, 'end'::text]))) not valid;

alter table "public"."workflow_steps" validate constraint "workflow_steps_ai_action_check";

alter table "public"."workflows" add constraint "workflows_mode_check" CHECK ((mode = ANY (ARRAY['strict'::text, 'smart'::text]))) not valid;

alter table "public"."workflows" validate constraint "workflows_mode_check";

alter table "public"."workflows" add constraint "workflows_sub_organization_id_fkey" FOREIGN KEY (sub_organization_id) REFERENCES public.sub_organizations(id) ON DELETE CASCADE not valid;

alter table "public"."workflows" validate constraint "workflows_sub_organization_id_fkey";

alter table "public"."workflows" add constraint "workflows_trigger_type_check" CHECK ((trigger_type = ANY (ARRAY['keyword'::text, 'intent'::text, 'always'::text]))) not valid;

alter table "public"."workflows" validate constraint "workflows_trigger_type_check";

set check_function_bodies = off;

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


  create policy "org_admin_update"
  on "public"."organizations"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.organization_users
  WHERE ((organization_users.organization_id = organizations.id) AND (organization_users.user_id = auth.uid()) AND (organization_users.role = 'admin'::text)))));



  create policy "kb_auth_delete"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using ((bucket_id = 'knowledge-base'::text));



  create policy "kb_auth_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'knowledge-base'::text));



  create policy "kb_auth_read"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using ((bucket_id = 'knowledge-base'::text));



  create policy "kb_auth_update"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using ((bucket_id = 'knowledge-base'::text));
