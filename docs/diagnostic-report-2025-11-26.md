# Diagnostic Report — 2025-11-26

## Summary
This report reconciles the product definition with the current codebase and highlights schema/type misalignments that threaten multi-tenant isolation, WhatsApp media handling, and KB retrieval accuracy. Immediate remediation focuses on updating client-side types and planning follow-up schema enforcement.

## Key Findings
- **Sub-organization coverage is missing from client types.** Migrations add `sub_organization_id` across conversations, messages, bot settings, knowledge base, campaigns, and WhatsApp settings, but `src/types/database.ts` lacked these fields, risking UI/edge code ignoring required filters and inserts. 
- **WhatsApp media/idempotency columns are untyped.** The schema now stores `mime_type`, `whatsapp_message_id`, and `wa_received_at` on `messages` for media handling and deduplication, but the frontend types omitted them, making consumers unaware of available metadata and uniqueness guarantees. 
- **Campaign metadata drift.** Campaigns and campaign messages include `created_by`, `sub_organization_id`, and timestamps per migrations, yet the client types were missing these fields, blocking downstream analytics and sub-org routing. 
- **Knowledge base structure drift.** `knowledge_articles`/`knowledge_chunks` include `sub_organization_id` and creation timestamps after schema fixes, but types did not, undermining RLS-aware fetching and chunk attribution. 
- **Contact model gap vs. product spec.** The DB still only stores `phone`, `name`, `labels`, and `created_at`; product requirements call for status/tags/assigned owner fields. A migration is needed to extend the table and align UI/state.

## Recommended Fixes
1. **Update shared types (done).** Synchronize `src/types/database.ts` with the latest migrations so UI/state hooks honor sub-organization scope, WhatsApp metadata, and KB/campaign fields.
2. **Propagate sub-org filters.** Audit data-fetching hooks and Edge Functions to ensure new `sub_organization_id` properties are required inputs/filters where appropriate.
3. **Extend contacts schema.** Add status/tags/assignment columns to `contacts`, update RLS, and reflect them in stores/UI per product definition.
4. **Media-aware messaging UI.** Surface `mime_type` and `media_url` in the inbox for WhatsApp media and leverage `whatsapp_message_id` for deduped renders.
5. **KB ingestion parity.** Ensure KB creation flows pass `sub_organization_id` through to articles and chunks so RAG queries remain tenant-accurate.

## Supabase To-Do Checklist
- [ ] Add `status`, `tags/labels`, and `assigned_to` (with org/sub-org FKs) to `contacts`; update RLS accordingly.
- [ ] Verify all tables touched by `sub_organization_id` have matching RLS policies and indexes for org+sub-org access.
- [ ] Confirm Edge Functions (`ai-handler`, `whatsapp-*`, campaigns) require `sub_organization_id` inputs and validate org membership.
- [ ] Re-run type generation or manual sync after future migrations to keep `src/types/database.ts` accurate.




