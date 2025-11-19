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
