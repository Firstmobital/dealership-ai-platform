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
