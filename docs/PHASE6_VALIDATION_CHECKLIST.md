# Phase 6 — Validation Checklist

## Chats
- Send a web message in an active conversation:
  - Message appears immediately (optimistic).
  - If insert fails, toast appears and the temp message disappears.
  - On success, list reconciles to server order using `order_at`.

- Send a WhatsApp message:
  - If WhatsApp send fails, toast appears.
  - On success, messages refresh.

## Campaigns
- Schedule a draft campaign:
  - UI shows `scheduled` immediately.
  - Campaign list and campaign messages are refreshed from DB.

- Retry failed campaign messages:
  - Status resets to `pending` and UI refreshes.

## Tenant isolation checks
Run `docs/PHASE6_DB_VALIDATION.sql` against production and confirm all checks return 0 (or expected rows) and no unexpected policies are missing.

## Campaigns
- Schedule a campaign:
  - Toast success appears.
  - Campaign status updates immediately and then is reconciled by refetch.

- Retry failed campaign messages:
  - Toast success appears.
  - Failed messages move back to pending and list is reconciled.

## Tenant isolation verification (SQL)
Run `docs/PHASE6_DB_VALIDATION.sql` in your DB to:
- Prove no tenant-owned table has NULL `organization_id`.
- Prove `knowledge_chunks` has RLS enabled.
- Prove key views are org-safe or flagged.
- Prove no NULL `organization_id` rows exist where required.
- Prove `knowledge_chunks` RLS is enabled.
- Surface any views that expose data without tenant filters.
