-- PHASE 0 — DATA SAFETY & TENANT INTEGRITY
-- Authoritative migration generated from forensic audit

BEGIN;

-- 1. messages: add organization_id and backfill
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS organization_id uuid;
UPDATE public.messages m
SET organization_id = c.organization_id
FROM public.conversations c
WHERE m.conversation_id = c.id AND m.organization_id IS NULL;
ALTER TABLE public.messages ALTER COLUMN organization_id SET NOT NULL;

-- 2. conversation_state: add organization_id and backfill
ALTER TABLE public.conversation_state ADD COLUMN IF NOT EXISTS organization_id uuid;
UPDATE public.conversation_state cs
SET organization_id = c.organization_id
FROM public.conversations c
WHERE cs.conversation_id = c.id AND cs.organization_id IS NULL;
ALTER TABLE public.conversation_state ALTER COLUMN organization_id SET NOT NULL;

-- 3. workflow_steps: add organization_id via workflows
ALTER TABLE public.workflow_steps ADD COLUMN IF NOT EXISTS organization_id uuid;
UPDATE public.workflow_steps ws
SET organization_id = w.organization_id
FROM public.workflows w
WHERE ws.workflow_id = w.id AND ws.organization_id IS NULL;
ALTER TABLE public.workflow_steps ALTER COLUMN organization_id SET NOT NULL;

-- 4. workflow_logs: add organization_id via workflows
ALTER TABLE public.workflow_logs ADD COLUMN IF NOT EXISTS organization_id uuid;
UPDATE public.workflow_logs wl
SET organization_id = w.organization_id
FROM public.workflows w
WHERE wl.workflow_id = w.id AND wl.organization_id IS NULL;
ALTER TABLE public.workflow_logs ALTER COLUMN organization_id SET NOT NULL;

-- 5. wallet_transactions: add organization_id via wallets
ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS organization_id uuid;
UPDATE public.wallet_transactions wt
SET organization_id = w.organization_id
FROM public.wallets w
WHERE wt.wallet_id = w.id AND wt.organization_id IS NULL;
ALTER TABLE public.wallet_transactions ALTER COLUMN organization_id SET NOT NULL;

-- 6. knowledge_chunks: enforce RLS
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

COMMIT;
