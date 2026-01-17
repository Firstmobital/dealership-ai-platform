# Phase 0 — Tenant Integrity Hardening

This phase enforces database-level tenant safety.

## Changes
- Added `organization_id NOT NULL` to tenant-owned tables:
  - messages
  - conversation_state
  - workflow_steps
  - workflow_logs
  - wallet_transactions
- Backfilled tenant IDs using authoritative parent relations
- Enabled RLS on knowledge_chunks

## Explicitly Not Changed
- No auth logic
- No AI logic
- No workflow execution logic

