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
