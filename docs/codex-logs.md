# Codex Implementation Log

## 2024-05-10
- Initialized Joyz-style dealership AI platform repository structure.
- Added architecture context documentation outlining modules, state stores, and backend functions.

## 2024-05-10 (Later)
- Scaffolded Vite + React + Tailwind frontend with multi-module layout.
- Implemented Zustand stores for auth, organizations, chats, knowledge base, workflows, and campaigns.
- Added Supabase migrations covering organizations, conversations, knowledge base, workflows, and campaigns with pgvector support.
- Created Supabase Edge Functions for WhatsApp webhook handling, AI engine orchestration, embedding pipeline, and campaign dispatching.

## 2024-05-11
- Added guardrails to the `ai-test` edge function to surface missing OpenAI credentials early.
- Documented local `.env.local` setup for supplying `OPENAI_API_KEY` to Supabase functions.
- Updated `.gitignore` to exclude local OpenAI env files from version control.

## 2025-11-18

- Added WhatsApp settings flow for each organization.
- Created `WhatsappSettings` type in `src/types/database.ts`.
- Implemented `src/lib/api/whatsapp.ts` with helpers to load and upsert whatsapp_settings rows.
- Rebuilt `src/state/useWhatsappSettingsStore.ts` using the new API helpers, with loading and error state.
- Added `src/modules/settings/WhatsappSettingsModule.tsx` and wired `/settings/whatsapp` route.
- Updated `src/components/sidebar/Sidebar.tsx` with a new “WhatsApp Settings” entry under Settings.
- Updated `src/App.tsx` routing to include the WhatsApp settings screen.

## 2025-11-19
- Enhanced `whatsapp-inbound` edge function to handle image/document media from WhatsApp Cloud API.
- Stored inbound WhatsApp media in a public Supabase Storage bucket (`whatsapp-media`) and attached `media_url` on `messages`.
- Improved ai-handler integration with safe `user_message` construction for media-only messages and a user-friendly fallback response when AI fails.

## 2025-11-19 — ai-handler RAG + WhatsApp-aware upgrade

- Replaced `supabase/functions/ai-handler/index.ts` with a multi-tenant, RAG-enabled implementation.
- Uses `match_knowledge_chunks` and OpenAI `text-embedding-3-small` to pull top relevant KB chunks per organization.
- Reads `bot_personality` and `bot_instructions` to shape tone, language, emoji usage, and fallback behavior.
- Adds channel-aware guidelines (`whatsapp` vs `web/internal`) for answer formatting.
- Keeps existing contract: `{ conversation_id, user_message, ai_response }` with no DB writes.


## 2025-11-22 — Stage 5C: WhatsApp pipeline sub-org audit

- Verified whatsapp-inbound:
  - Resolves organization via whatsapp_settings.whatsapp_phone_id.
  - Resolves sub_organization_id using settings, classifier, or "general".
  - Upserts conversations and messages with correct organization_id and sub_organization_id.
  - Calls ai-handler using conversation_id.

- Verified ai-handler:
  - Loads conversation to derive organization_id + sub_organization_id.
  - Scopes bot_personality, bot_instructions, and knowledge_articles by org + sub-org.
  - Inserts AI messages with sub_organization_id for both web and WhatsApp.
  - Calls whatsapp-send with organization_id + sub_organization_id for WhatsApp replies.

- Verified whatsapp-send:
  - Resolves whatsapp_settings using (org, sub-org) with org-level fallback.
  - Sends outbound messages via correct Cloud API phone number per sub-org.

- Frontend (ChatsModule + useChatStore) confirmed to:
  - Filter conversations/messages by org + sub-org.
  - Insert new messages with sub_organization_id.
  - Call whatsapp-send with both organization_id and sub_organization_id for WhatsApp chat replies.

- Identified optional improvement:
  - campaign-dispatch currently calls whatsapp-send without sub_organization_id.
  - Proposed update to pass sub_organization_id from campaign_messages so campaigns can use sub-org-specific WhatsApp numbers.

## 2025-11-22 — Stage 5G: KB from Unanswered Questions

- Extended UnansweredQuestionsModule with:
  - AI-generated KB answer per question (`ai-generate-kb` function).
  - "Save as KB Article" action that persists content to knowledge_articles.
  - Automatic deletion of unanswered_questions entry once saved.
- Created kb-save-from-unanswered Edge Function:
  - Inserts new knowledge_articles row (org + sub-org aware).
  - Chunks article content and generates OpenAI embeddings.
  - Inserts chunks into knowledge_chunks for RAG.
- Result: AI fallback questions can now be promoted into fully searchable KB
  articles in one click, closing the learning loop for the bot.

## 2025-11-24 – Step 2: Auth + Shell Foundation

- Rebuilt App.tsx with protected routing, auth guard, and nested modules (chats, KB, bot, workflows, campaigns, settings, WhatsApp, unanswered).
- Implemented robust useAuthStore with Supabase v2 (session persistence, login, signup, logout, reset, update password).
- Cleaned and finalized Login / Signup / ResetPassword / UpdatePassword pages.
- Fixed Sidebar navigation structure to match routes.
- Fixed Topbar sign-out and connected OrganizationSwitcher + SubOrgSwitcher.
- Resolved activeOrganization vs currentOrganization mismatch in SubOrgSwitcher.

## 2025-11-24 – Step 4A: Knowledge Base Store

- Implemented useKnowledgeBaseStore with org + sub_org aware fetching of knowledge_articles.
- Added createArticleFromText using ai-generate-kb edge function (RAG ingestion).
- Added createArticleFromFile: uploads to knowledge-base bucket, then invokes ai-generate-kb for text extraction + chunking.
- Added deleteArticle with organization guard and automatic list refresh.
- Standardized error/loading/uploading states for Knowledge Base UI.

## Step 4B – UnansweredQuestionsModule

- Implemented full UI for unanswered questions.
- Added list view, selection, preview, deletion.
- Added Save-to-KB UI linking to kb-save-from-unanswered function.
- Fully integrated multi-org + sub-org flows.
- Polished UX consistent with KB module.

## Step 4C – kb-save-from-unanswered Edge Function
- Fully implemented unanswered → KB pipeline.
- Loads unanswered question by org + sub-org.
- Creates KB article with AI-generated summary.
- Chunks question text and generates embeddings.
- Inserts knowledge_chunks rows.
- Deletes unanswered question after saving.
- Fully matches frontend store contract.

## Step 5B – WhatsApp Settings UI

- Implemented full WhatsAppSettingsModule with hybrid fallback support.
- Shows banners for org-level fallback vs sub-org override.
- Supports editing phone number, API token, verify token, phone ID, business ID.
- Supports enabling/disabling WA.
- Matches useWhatsappSettingsStore hybrid behavior exactly.
- Fully multi-tenant and sub-organization aware.

## Step 5C – Sub-Organization Store

- Implemented full useSubOrganizationStore with CRUD for sub_organizations.
- Added activeSubOrg state and context switching for multi-tenant flows.
- Integrated with organization store for scoped fetching.
- Ensures inbox, WhatsApp, KB, and campaign modules respect sub-org isolation.
- Fully compatible with hybrid WhatsApp settings (org fallback).

## Step 5D – SubOrganizationsPanel UI

- Implemented full UI for sub-organization management.
- Supports create, edit, delete, and activate sub-org.
- Integrated with useSubOrganizationStore and org switcher.
- Matches overall design system of the platform.
- Fully multi-tenant and sub-org aware.

## 2025-11-24 – Stage 6B: Edge Function + Schema Hardening (WhatsApp)

- Added messages.mime_type column via stage_6b_add_mime_type_to_messages migration
  to support storing inbound WhatsApp media MIME types.

- Fixed whatsapp-inbound to insert into messages.text (not a non-existent
  content column), aligning with the canonical messages schema.

- Confirmed whatsapp-inbound stores:
  - conversation_id
  - sender = 'customer'
  - message_type
  - text
  - media_url
  - mime_type
  - channel = 'whatsapp'
  - sub_organization_id

- Verified overall WhatsApp pipeline is consistent with multi-org + sub-org
  design and RLS policies.

## 2025-11-24 – Stage 6C Standardization Finalization

- Fully removed SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
- Standardized PROJECT_URL and SERVICE_ROLE_KEY across all edge functions.
- Updated supabase/.env and frontend .env.local to use the new canonical keys.
- Ensured all edge functions initialize Supabase using:
  createClient(PROJECT_URL, SERVICE_ROLE_KEY).
- Unified configuration for local development, staging, and production environments.

## 2025-11-24 – Stage 6D: Cleanup & Optimization (WhatsApp inbound)

- Added messages.whatsapp_message_id and messages.wa_received_at columns with
  a unique index on whatsapp_message_id to guarantee idempotent processing
  of inbound WhatsApp webhooks.
- Updated whatsapp-inbound edge function to:
  - Check for existing messages by whatsapp_message_id and safely skip duplicates.
  - Gate logs behind a DEBUG env flag to keep production logs clean.
  - Truncate overly long inbound text to MAX_TEXT_LENGTH for safety.
  - Store wa_received_at timestamp and whatsapp_message_id alongside each inbound
    WhatsApp message.
- This completes WhatsApp inbound hardening for Stage 6D.

## 2025-11-26 – Schema/type sync and diagnostic

- Synced `src/types/database.ts` with the latest Supabase migrations, adding
  sub-organization IDs, WhatsApp metadata, and campaign/KB fields to prevent
  multi-tenant drift in the frontend.
- Added `docs/diagnostic-report-2025-11-26.md` summarizing schema/type gaps vs.
  product requirements and a Supabase to-do checklist for upcoming migrations.

## 2025-12-02 – Type fixes and build verification

- Updated TypeScript logic across auth, campaigns, chats, knowledge base, and
  unanswered modules to resolve build-blocking type errors (boolean guards,
  optional timestamps, corrected className, and message payload typing).
- Switched the lint script to `tsc --noEmit` so type checks can run without
  external registry access.
- Attempted dependency installation for ESLint plugins, but registry access was
  blocked (HTTP 403); documented failure and proceeded with available tooling.

## 2025-12-03 – Readiness score + validation run
- Added `docs/readiness-score-2025-12-03.md` capturing a 58/100 production readiness rating with scoring rationale, critical gaps, ## 2025-12-05 – Stage 6: DB & RLS Verification

- Verified production schema for core tables:
  - `messages`, `conversations`, `whatsapp_settings`, `knowledge_articles`, `knowledge_chunks`.
- Confirmed presence of key fields:
  - `messages.channel`, `messages.mime_type`, `conversations.channel`,
    `whatsapp_settings.(phone_number, api_token, verify_token, whatsapp_phone_id, whatsapp_business_id, is_active, sub_organization_id)`,
    `knowledge_chunks.embedding`.
- Confirmed all relevant tables have RLS enabled:
  - `contacts`, `conversations`, `messages`, `knowledge_articles`, `knowledge_chunks`, `whatsapp_settings`.
- Confirmed org/suborg scoped policies and service-role-only access on `knowledge_chunks`.

Result: Stage 6 – Steps 6.1 (DB consistency) and 6.2 (RLS hardening baseline) are complete. No new migrations required.
and Supabase to-dos.
- Re-ran lint/type-check and production build to validate current state after prior fixes.


## 2025-12-05 – Stage 6: WhatsApp Webhook Cleanup

- Removed legacy Edge Function `whatsapp-webhook`:
  - It duplicated inbound handling now covered by `whatsapp-inbound`.
  - It referenced the old `ai-engine` function and lacked multi-org/sub-org, idempotency, and media handling.
- Confirmed `whatsapp-inbound` is the single WhatsApp webhook entrypoint for Meta.
- Cleaned up local code by deleting `supabase/functions/whatsapp-webhook`.

Result: WhatsApp ingest pipeline is simpler, safer, and fully routed through `whatsapp-inbound` → `ai-handler`.

## 2025-12-08 – KB ingestion fixed in production

- Root cause: production `knowledge_chunks` table was in a broken legacy state (wrong columns/FK, partial migrations).
- Actions:
  - Added rebuild migration to drop and recreate `knowledge_chunks` with `embedding vector(1536)` and IVFFLAT index.
  - Cleaned up RLS for `knowledge_chunks`, allowing full `service_role` access.
  - Updated `ai-generate-kb` to log and return real Supabase errors for chunk insertion.
  - Verified with curl: ai-generate-kb now returns `success: true`, creates article + chunks.
- Result:
  - Knowledge Base text ingestion works end-to-end in production.
  - Chat AI can now use KB articles for answers.

## 2025-12-16 — Phase 1: Database Foundation for Bulk Messaging Tracker

- Added structured contact fields: first_name, last_name, model.
- Added campaigns.template_name to separate “template/use-case” from campaign batch name.
- Added sub_organization_id to campaigns and campaign_messages to align DB with TS types and multi-tenant design.
- Added contact_campaign_summary view to power the Database screen with Delivered vs Failed campaign lists per phone number.

## 2025-12-16 — Phase 2A: Database Contact Bulk Upload

- Implemented contact-only bulk upload via Edge Function.
- Backend normalizes Indian phone numbers (+91).
- Safe upsert logic: enrich missing fields, never overwrite.
- Optional tag/label support for legacy imports.
- Campaigns and WhatsApp messaging intentionally excluded.

## 2025-12-16 — Phase 2B: Campaign Upload & Dispatch

- Campaign uploads now upsert contacts before sending.
- Indian phone numbers normalized (+91) at backend.
- campaign_messages linked to contacts via contact_id.
- Added template_name to campaigns for Database aggregation.
- Existing Retry Failed logic preserved.

## 2025-12-16 — Phase 6A: Analytics DB Views

- Added campaign_analytics_summary view for campaign-level metrics.
- Added template_analytics_summary view for template performance.
- Added model_analytics_summary view for model-wise delivery analytics.
- Added failure_reason_summary view for WhatsApp failure diagnostics.
- All analytics computed at DB level for fast, safe UI rendering.

## 2025-12-16 — Phase 7A: AI Campaign History Context Injection

- Injected per-contact campaign delivery history into ai-handler system prompt.
- AI now aware of delivered and failed campaign templates.
- Prevents offer repetition and improves follow-up tone.
- Uses contact_campaign_summary view (no schema changes).

## 2025-12-16 — Phase 7B: AI Controlled Silence (No-Reply Logic)

- Introduced <NO_REPLY> token allowing AI to intentionally stay silent.
- AI now avoids replying to acknowledgements or low-value messages.
- Prevents spammy or pushy behavior after campaign delivery.
- Backend safely detects and suppresses message send.


## 2025-12-16 — Phase 7C: AI Follow-up Suggestions (Human-in-the-loop)

- Added suggest_followup mode to ai-handler.
- AI generates short WhatsApp follow-up suggestions using campaign history.
- Suggestions are never auto-sent or saved.
- Enables human-reviewed, intelligent follow-ups.

## 2025-12-20 — Step 1: WhatsApp Templates (Draft CRUD)
- Added whatsapp_templates table with org/sub-org scope + RLS policies
- Added frontend Templates Manager UI (create/edit/delete draft templates)
- Added Zustand store for template CRUD
- Wired Templates page into Settings routes + sidebar
