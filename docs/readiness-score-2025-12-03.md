# Production Readiness Score — 2025-12-03

**Overall readiness:** 58/100

## How the score was computed
- **Architecture fit (15/20):** Core React + Supabase foundation, inbox, KB ingestion, and AI handler are present, but several flows still bypass explicit org/sub-org enforcement and RLS verification.
- **Feature coverage (18/35):** Conversations, KB ingestion, unanswered-to-KB, and WhatsApp inbound/outbound basics exist. Campaign UI/dispatch, contacts enrichment, workflows, and admin analytics are incomplete or missing.
- **Data integrity & multi-tenancy (12/25):** Schema includes org + sub-org columns, but contacts lack status/tags/assigned owner; RLS parity for new fields and idempotent WhatsApp keys needs validation.
- **Reliability & testing (5/10):** Build and type checks pass; no automated integration/e2e coverage is present.
- **Operational readiness (8/10):** Env key standardization to PROJECT_URL/SERVICE_ROLE_KEY is in place; observability and alerting are not yet configured.

## Critical gaps to reach production
1. **Contacts schema & UI alignment:** Add status/tags/assigned owner with org/sub-org scoping, update RLS, and surface in inbox/lead views.
2. **Campaign lifecycle:** Ensure CSV ingestion, scheduling, and dispatch through the Edge Function support org + sub-org filters, logging, and retries.
3. **Workflows engine:** Implement trigger/action automations (new lead, inbound message, timers) with actions for WhatsApp sends, agent assignment, tagging, and campaign start.
4. **Admin analytics:** Add dashboard metrics for conversations, contact funnel, AI accuracy, and usage by org/sub-org.
5. **Testing & observability:** Add integration tests around inbox, KB ingestion, WhatsApp inbound/outbound, and campaign dispatch; wire basic logging/monitoring for Edge Functions.

## Supabase to-do (delta from current state)
- [ ] Migrate `contacts` to include `status`, `tags/labels`, and `assigned_to` with org/sub-org foreign keys; refresh RLS.
- [ ] Validate RLS coverage for all tables using `sub_organization_id`, especially campaigns, KB, WhatsApp settings/messages.
- [ ] Add indexes supporting org + sub-org filters on high-volume tables (messages, conversations, knowledge_chunks).
- [ ] Confirm `whatsapp_message_id` uniqueness and wa_received_at ingestion in production data; backfill if needed.
- [ ] Add workflow tables/triggers to support automation engine once designed.

