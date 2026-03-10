Project Overview

Project: Joyz-style Dealership AI Platform
Stack: React + Tailwind + Supabase (Postgres, RLS, Edge Functions)
Tenancy Model: Organization-only (finalized Jan 2026)
Channels: WhatsApp (primary), Web
AI Modes: Deterministic KB + Workflows + Controlled Free AI

This log records what changed, why it changed, and what was explicitly not changed, with production safety as the primary constraint.

1️⃣ Foundation & Early Architecture
2024-05-10 — Repository & Architecture Initialization

Initialized repository structure for Joyz-style dealership AI platform.

Documented high-level architecture: frontend modules, state stores, Supabase backend, Edge Functions.

2024-05-10 (Later) — Frontend & Backend Scaffolding

Scaffolded Vite + React + Tailwind frontend.

Implemented Zustand stores for auth, organizations, chats, KB, workflows, campaigns.

Added Supabase migrations for:

organizations

conversations

messages

knowledge base (pgvector enabled)

workflows

campaigns

Created Edge Functions:

whatsapp-inbound

ai-handler (early version)

ai-generate-kb

campaign-dispatch

2️⃣ Early AI & WhatsApp Stabilization
2024-05-11 — AI Guardrails

Added credential guardrails to ai-test function.

Documented .env.local setup for OpenAI.

Updated .gitignore for sensitive env files.

3️⃣ WhatsApp Integration Evolution
2025-11-18 — WhatsApp Settings (Org-Level)

Added whatsapp_settings table and UI.

Implemented WhatsApp Settings module and store.

Wired routing and sidebar entry.

2025-11-19 — WhatsApp Inbound Media Support

Enhanced whatsapp-inbound to handle image/document media.

Stored inbound media in whatsapp-media bucket.

Linked media_url on messages.

Improved AI fallback handling for media-only messages.

4️⃣ AI Engine Evolution
AI Behavior Contract v1 — RAG (Semantic)

Period: Until Nov 2025

RAG-based semantic search using embeddings.

Knowledge chunks fetched via vector similarity.

2025-11-19 — ai-handler RAG Upgrade

Rebuilt ai-handler:

Multi-tenant

RAG-enabled

Reads bot_personality and bot_instructions

Channel-aware formatting

Maintained stateless contract (no DB writes).

5️⃣ Multi-Tenancy (Sub-Org Era — Later Reverted)
2025-11-22 — Sub-Organization Introduction

Introduced sub_organizations and sub_organization_users.

Scoped WhatsApp, AI, KB, and Campaigns by org + sub-org.

Added fallback logic (org-level → sub-org).

⚠️ Later determined to be over-complex and fragile.

6️⃣ Knowledge Base & Learning Loop
2025-11-22 — Unanswered Questions → KB

Added unanswered_questions module.

Implemented kb-save-from-unanswered Edge Function.

Enabled AI fallback questions to become KB articles.

2025-12-08 — 🚨 Production Incident: KB Ingestion Failure

Root Cause: Legacy/broken knowledge_chunks schema in production
Impact: AI unable to retrieve KB articles
Fix:

Dropped and rebuilt knowledge_chunks with correct vector schema.

Fixed RLS.

Improved error logging in ai-generate-kb.
Outcome: KB ingestion restored end-to-end.

7️⃣ Auth, Shell & UX Hardening
2025-11-24 — Auth & Shell Foundation

Rebuilt App.tsx with protected routing.

Finalized auth flows (login/signup/reset/update).

Fixed org vs active org mismatches.

Stabilized sidebar + topbar behavior.

8️⃣ WhatsApp Pipeline Hardening (Stage 6)
2025-11-24 — Stage 6B–6D

Added messages.mime_type.

Fixed whatsapp-inbound to use canonical schema.

Added whatsapp_message_id + wa_received_at.

Enforced idempotency on inbound messages.

Removed legacy whatsapp-webhook function.

9️⃣ Analytics & Campaigns
2025-12-16 — Analytics Views

Added DB-level analytics views:

campaign_analytics_summary

template_analytics_summary

model_analytics_summary

failure_reason_summary

2025-12-16 — Campaign Upload & Dispatch

Implemented bulk contact upload.

Normalized Indian phone numbers.

Linked campaigns → contacts → messages.

🔟 Wallet & Billing System
Phase 5.1–5.5 — Wallet System (Ledger-First)

Added wallets and wallet_transactions.

Enforced non-negative balances.

Added thresholds (low / critical).

Added wallet alerts + sidebar badges.

Implemented Razorpay:

Orders

Webhook verification

Ledger credit via service role

Manual credit RPC for admins.

🤖 AI Behavior Contract Evolution
AI Behavior Contract v2 — Deterministic KB

2026-01-02

Replaced semantic RAG with deterministic title/keyword matching.

Enforced priority:

Workflow

KB

Free AI

AI Behavior Contract v3 — Controlled Silence

Introduced <NO_REPLY> token.

AI suppresses replies to low-value messages.

AI Behavior Contract v4 — Lifecycle Learning

Unanswered questions now lifecycle-based:

open → answered / ignored

No deletion.

Full auditability preserved.

🏗️ ADR-001: Removal of Sub-Organization Layer
2026-01-06 — Architectural Decision Record
Decision

Remove sub-organization layer entirely.

Why

Data fragmentation

RLS complexity

UX confusion

Operational risk

Actions

Dropped sub_organizations & sub_organization_users.

Removed all sub_organization_id columns and FKs.

Rebuilt RLS policies to org-only.

Rebuilt dependent views and analytics.

Outcome

Platform is now organization-only

Security model simplified

Data visibility stabilized

🚨 Production Incidents & Fixes
2026-01-07 — P0 Production Hardening

Fixed broken psf_cases_view.

Added agent to message_sender enum.

Enabled missing RLS on:

conversation_state

wallet_alert_logs

whatsapp_bulk_logs

contact_uploads

campaign_delivery_import

Removed WhatsApp verify-token fallback.

Fixed PSF sentiment type drift.

📌 Deferred / Explicitly Not Implemented (Intentional)

Campaign retries

WhatsApp send idempotency (outbound)

Wallet auto-blocking AI calls

Refunds / chargebacks

Multi-currency wallets

📍 Current State (As of 2026-01-07)

✅ Production-stable

✅ Org-only tenancy

✅ Deterministic AI behavior

✅ Auditable wallet & billing

⚠️ P1 stabilization pending (token exposure, callback audits)

## 2026-01-07 — P1 Stabilization (Idempotency + Receipts Visibility + Expiring AI Lock)

### P1-A — WhatsApp Outbound Idempotency
- Added `messages.outbound_dedupe_key` with unique index per conversation.
- Updated `whatsapp-send` to compute a stable SHA-256 dedupe key and skip repeat sends.
- Prevents duplicate WhatsApp messages from retries, double submits, or redeploys.

### P1-B — Campaign Delivery Receipt Dead-Letter Logging
- Added `campaign_delivery_receipt_failures` table (org-scoped, RLS protected).
- Updated `whatsapp-inbound` to log unmatched delivery receipts for operator visibility.
- No retries or reprocessing added (intentional).

### P1-C — Agent Takeover Lock With Expiry
- Added `conversations.ai_locked_until`.
- Updated `ai-handler` to block replies only while lock is active; auto-unlocks when expired.
- Updated frontend manual sends to use `sender="agent"` and apply a 30-minute takeover lock.

# Codex Logs

## 2026-01-07 — P0-A Inbox WhatsApp Send + Typing Indicators + Read Receipts UI

**Scope (P0-A)**
- Enable WhatsApp agent sends from inbox using `whatsapp-send` Edge Function (JWT verified).
- Add internal typing indicators (agent + AI suggestion) via Supabase Realtime broadcast.
- Add delivery/read receipts storage (messages table) and UI display for outbound WhatsApp messages.

**Key changes**
- `whatsapp-send` now supports `conversation_id` payload (inbox agent send). It resolves org/contact/phone, checks org membership, sends to Meta, inserts message with `sender=agent`, and takes AI takeover lock.
- `whatsapp-inbound` now updates inbox `messages` receipts (sent/delivered/read/failed) in addition to campaign receipt updates.
- Frontend composer uses controlled draft + attachment picker; sends WhatsApp via `whatsapp-send` and shows typing indicators + receipts.

**DB impact**
- Added receipt columns to `public.messages`: `whatsapp_status`, `sent_at`, `delivered_at`, `read_at`.

# Codex Logs

## 2026-01-07 — Consolidated P0-A + P0-B + P1 rollout (P3 deferred)

### Summary
- **P0-A**: Inbox WhatsApp agent send through `whatsapp-send` (JWT verified), internal typing indicators (broadcast), and WhatsApp read receipts UI using `messages.whatsapp_status` and receipt timestamps.
- **P0-B**: Realtime isolation and org switching safety by scoping message realtime subscription to the active conversation only and tearing down channels on organization or conversation switches.
- **P1-A**: AI human-active guard corrected to check the most recent agent message and audit when auto-reply is skipped.
- **P1-B**: WhatsApp inbound pipeline now logs and surfaces DB and AI-trigger failures instead of silently swallowing them.

## 2026-01-08 — Frontend readiness fixes for lead generation

### Summary
- Prevented refresh on **/chats** from temporarily redirecting to **/settings** by holding routing until org bootstrap completes.
- Added **Create Organization** flow (button + modal) directly in the org switcher.
- Fixed **Chats** left sidebar to scroll internally (page no longer scrolls with contact list).
- Fixed **Database** header row to stay pinned by constraining table scroll container and making the header sticky.
- Added **Knowledge Base** edit/delete actions and file replace/download controls.
- Improved **Workflows** spacing + readability.

### DB impact
- Added `wallet_transactions.organization_id` (backfilled from wallets) so wallet transactions can be filtered by org.

## 2026-01-10 — Variable Template Hardening (WhatsApp)

### Added
- WhatsApp template variable schema (header + body)
- CSV parsing with explicit header/body support
- Campaign-level variable validation
- Dispatch-time per-recipient variable enforcement

### Database
- whatsapp_templates:
  - header_variable_count
  - header_variable_indices
  - body_variable_count
  - body_variable_indices

### Behavior Changes
- Campaigns cannot send if variables mismatch template
- Rows with missing variables are marked FAILED
- Header variables are no longer inferred

### Status
- Variable-based templates: PRODUCTION READY
- Backward compatibility preserved

2026-01-10 — Phase A completed

Added clean category badge UI for templates list + stabilized category selector for Meta-synced categories.

Upgraded whatsapp-template-sync to insert Meta-only templates and hydrate local rows with category/header/body/footer + variable schema fields.

Mapped Meta PAUSED → local approved (no paused state locally).

2026-01-10 — Phase B completed
- Unified CSV/Excel ingestion across Campaigns and Database uploads
- Centralized phone normalization and header handling
- Preserved full row metadata without hardcoded field extraction

2026-01-10 — Step 3 completed (Schema)
- Added jsonb metadata column to contacts for full-row preservation
- Added jsonb raw_row column to campaign_messages for per-message row snapshot
- No RLS changes required

# Codex Logs

## 2026-01-12

### Security & correctness fixes
- **Edge Function user-scoped Supabase client**: updated `whatsapp-send` to use `SUPABASE_ANON_KEY` for user/membership checks so **RLS is enforced**; service-role client remains for privileged writes.
- **WhatsApp inbound webhook signature verification**: added optional validation of `X-Hub-Signature-256` using `WHATSAPP_APP_SECRET` (recommended for production).

### Multi-tenant org creation
- Added new Edge Function `org-create` to create an organization + admin membership using service role, authenticated via anon client.
- Updated frontend `useOrganizationStore.createOrganization()` to call `org-create` instead of inserting into `organizations` directly (works with service-role-only insert policy).

### Logout hardening
- Added `reset()` actions to key Zustand stores and wired `useAuthStore.signOut()` to clear cached/org-scoped state to prevent cross-user leakage.

### New / updated environment variables
- `SUPABASE_ANON_KEY` (Edge Functions that need user-scoped reads)
- `WHATSAPP_APP_SECRET` (WhatsApp inbound signature verification)


# codex-logs.md

## 2026-01-28 — P0 KB + Workflow Reliability Fixes

### Summary
This change-set fixes the two most common failure modes you were seeing:

1. **Knowledge Base not being used** because embeddings were frequently created **before** PDF extraction completed (race) or were **double-created** for Excel/CSV uploads.
2. **Workflows not being followed** because an `always` workflow could hijack selection, and intent routing was hardcoded to OpenAI even when the org is configured for Gemini.

### Code changes
- **Frontend KB workflow**
  - Removed the unconditional `embed-article` call after file upload and file replacement.
  - Added comments clarifying the single-owner responsibility:
    - PDFs: `pdf-to-text` embeds **after** extraction.
    - Excel/CSV: `ai-generate-kb` embeds internally.

- **PDF extraction → embedding**
  - `pdf-to-text` now invokes `embed-article` **internally** immediately after saving extracted text.
  - The existing background job enqueue remains as a best-effort fallback.

- **Workflow trigger selection**
  - Made selection deterministic with priority:
    1) keyword workflows
    2) intent workflows
    3) always workflows (fallback)
  - Intent classification now uses the org’s configured AI provider/model via `resolveAISettings` + `runAICompletion`.

### Files changed
- `src/state/useKnowledgeBaseStore.ts`
- `supabase/functions/pdf-to-text/index.ts`
- `supabase/functions/ai-handler/index.ts`

### No database changes
- No tables/columns/RLS/policies were modified in this change-set.

### Operational notes
- `pdf-to-text` now requires `INTERNAL_API_KEY` to be set (same as `background-worker`).
- If `INTERNAL_API_KEY` is missing, PDF extraction still completes, and embedding will still be enqueued as a background job (fallback), but immediate embedding will not run.

## 2026-02-28 — P0 Media Assets: seed + WhatsApp send wiring

### What was added
- **`media_assets` table (org-scoped) + storage bucket for media** (cars images + brochures).
- **`ai-handler` WhatsApp media sending**:
  - If the user explicitly asks for **photos** or a **brochure**, the handler looks up matching `media_assets` for the locked/detected model (+ optional variant) and sends:
    - up to **3 images**
    - up to **1 brochure (PDF)**
  - Media messages are also inserted into `public.messages` as `message_type = image|document` with `media_url`, `mime_type`, and metadata.

### Storage path convention
Use org-prefixed paths so assets are naturally tenant-isolated:
- Car images: `<org_id>/cars/<model>/<filename>`
- Brochures: `<org_id>/brochures/<model>/<filename>`

Examples:
- `<ORG_ID>/cars/nexon/front-3q.jpg`
- `<ORG_ID>/brochures/nexon/nexon-brochure.pdf`

### Example SQL seed (Nexon: 1 image + 1 brochure)
> Replace placeholders: `<ORG_ID>`, `<PATH_IMAGE>`, `<PATH_BROCHURE>`.

```sql
-- 1) Seed 1 Nexon image
insert into public.media_assets (
  organization_id,
  asset_type,
  model,
  variant,
  title,
  storage_bucket,
  storage_path,
  mime_type,
  is_active
) values (
  '<ORG_ID>',
  'image',
  'Nexon',
  null,
  'Nexon - Front 3/4',
  'media',
  '<PATH_IMAGE>',
  'image/jpeg',
  true
);

-- 2) Seed 1 Nexon brochure
insert into public.media_assets (
  organization_id,
  asset_type,
  model,
  variant,
  title,
  storage_bucket,
  storage_path,
  mime_type,
  filename,
  is_active
) values (
  '<ORG_ID>',
  'brochure',
  'Nexon',
  null,
  'Nexon Brochure',
  'media',
  '<PATH_BROCHURE>',
  'application/pdf',
  'nexon-brochure.pdf',
  true
);
```

### 3-minute manual test checklist
1) Upload files to the **media bucket**:
   - Image at `<ORG_ID>/cars/nexon/front-3q.jpg`
   - PDF at `<ORG_ID>/brochures/nexon/nexon-brochure.pdf`
2) Insert the `media_assets` rows above (image + brochure).
3) From the WhatsApp conversation, send: **"send nexon photos"**
4) From the WhatsApp conversation, send: **"send nexon brochure"**
5) Confirm:
   - Outbound media appears in the **UI chat** (message_type image/document)
   - The same media arrives on **WhatsApp**

## 2026-03-10 — Phase 5: Explicit campaign → workflow binding (optional)

### Objective
Add an optional, explicit workflow binding to campaigns so campaign replies can be routed to the intended workflow without relying on `reply_sheet_tab` string matching.

### Schema change
- Added `public.campaigns.workflow_id uuid null` with FK to `public.workflows(id)` (`ON DELETE SET NULL`).
- No RLS changes made (campaign/workflow access already scoped by organization policies).
- No new index added (repo usage reads campaigns by `organization_id/status` and validates workflows by primary key during dispatch).

### Backend files changed
- `supabase/functions/campaign-dispatch/index.ts`
  - Fetches `campaigns.workflow_id`.
  - Workflow attach priority:
    1) If `campaign.workflow_id` present: validate workflow exists and org matches campaign; then attach to `conversations.workflow_id` and ensure exactly one active `workflow_logs` row.
    2) If `campaign.workflow_id` is null: LEGACY COMPATIBILITY PATH uses existing `reply_sheet_tab` ↔ `workflow.name` matching.
  - Unsafe/missing workflows fail safely (logged, dispatch continues).

### Frontend files changed
- `src/state/useCampaignStore.ts`
  - Campaign create payload supports optional `workflow_id` and persists it.
- `src/modules/campaigns/CampaignsModule.tsx`
  - Added optional workflow selector fetching org-scoped active workflows via client-side Supabase.
  - Helper text clarifies `reply_sheet_tab` is for operational logging/sheets, not workflow routing authority.

### Backward compatibility
Existing campaigns with `workflow_id = null` keep the previous behavior (reply-tab matching). Campaign sheet logging via `reply_sheet_tab` is unchanged.

### Risks
- Organizations with multiple similarly named workflows may still get incorrect matches for legacy campaigns. Mitigation: set `workflow_id` for new campaigns.
- If a workflow is deleted, `workflow_id` becomes null (FK `SET NULL`) and the system falls back to legacy matching unless explicitly prevented by setting/clearing.

## 2026-03-10 — Phase 5 finalization: safe campaign → workflow attach

### Summary
- Fixed a Phase 5 edge-case where `campaign-dispatch` could **accidentally null out** an existing `conversations.workflow_id` when no workflow was attached.
- Enforced the product rule for explicit `campaigns.workflow_id`: it may attach **only** when the workflow **exists**, belongs to the **same organization**, and `is_active = true`.
- Preserved backward compatibility for legacy campaigns (`workflow_id IS NULL`) that use `reply_sheet_tab` ↔ `workflow.name` matching.

### Behavior changes (production-safe)
- Conversation updates now **only include** `workflow_id` when a **valid** workflow was attached.
- If `campaign.workflow_id` points to a missing, wrong-org, or **inactive** workflow:
  - dispatch continues
  - logs clearly
  - does **not** attach
  - does **not** create `workflow_logs`
  - does **not** clear any existing `conversations.workflow_id`
- Legacy matching runs only when `campaign.workflow_id` is null and also never clears an existing `conversations.workflow_id` when no match is found.

### Schema snapshots
- Synced schema reference SQL files to reflect `public.campaigns.workflow_id uuid null` with FK → `public.workflows(id)` and `ON DELETE SET NULL`.
