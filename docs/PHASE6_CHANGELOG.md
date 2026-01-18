# Phase 6 — Product Hardening

## Scope
UI↔backend contract hardening and reconciliation reads after critical mutations.

## Changes

### Chats (`src/state/useChatStore.ts`)
- User-facing error toasts for WhatsApp send failures and message insert failures.
- Optimistic UI insert for non-WhatsApp messages.
- Reconciliation read (`fetchMessages`) after successful sends.

### Campaigns (`src/state/useCampaignStore.ts`)
- User-facing error toasts for scheduling/retry failures.
- Reconciliation read (`fetchCampaigns`, `fetchCampaignMessages`) after scheduling and retry actions.
