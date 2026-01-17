-- Phase 6 (2026-01-17)
-- Tenant hardening: enforce organization_id invariants and add org scoping columns where missing.
-- This migration FAILS LOUDLY if NULL-tenant rows exist so you can fix data safely.

BEGIN;

/* ========================================================================== */
/* PRECHECKS (FAIL LOUDLY)                                                     */
/* ========================================================================== */

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.conversations WHERE organization_id IS NULL) THEN
    RAISE EXCEPTION 'Phase6: conversations.organization_id contains NULLs. Fix or delete those rows before applying NOT NULL.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.contacts WHERE organization_id IS NULL) THEN
    RAISE EXCEPTION 'Phase6: contacts.organization_id contains NULLs. Fix or delete those rows before applying NOT NULL.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.knowledge_articles WHERE organization_id IS NULL) THEN
    RAISE EXCEPTION 'Phase6: knowledge_articles.organization_id contains NULLs. Fix or delete those rows before applying NOT NULL.';
  END IF;
END $$;

/* ========================================================================== */
/* ENFORCE NOT NULL ON EXISTING TENANT COLUMNS                                 */
/* ========================================================================== */

ALTER TABLE public.conversations
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.contacts
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.knowledge_articles
  ALTER COLUMN organization_id SET NOT NULL;

/* Helpful indexes for tenant scoping */
CREATE INDEX IF NOT EXISTS idx_conversations_org_last_message_at
  ON public.conversations (organization_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_contacts_org_phone
  ON public.contacts (organization_id, phone);

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_org_updated
  ON public.knowledge_articles (organization_id, updated_at DESC);

/* ========================================================================== */
/* MESSAGES: ADD organization_id + BACKFILL + ENFORCE                          */
/* ========================================================================== */

-- 1) Add column (nullable initially)
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS organization_id UUID;

-- 2) Backfill from conversations
UPDATE public.messages m
SET organization_id = c.organization_id
FROM public.conversations c
WHERE m.organization_id IS NULL
  AND m.conversation_id = c.id;

-- 3) Fail loudly if still NULL
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.messages WHERE organization_id IS NULL) THEN
    RAISE EXCEPTION 'Phase6: messages.organization_id could not be backfilled. Ensure every message has a valid conversation_id.';
  END IF;
END $$;

-- 4) Enforce NOT NULL
ALTER TABLE public.messages
  ALTER COLUMN organization_id SET NOT NULL;

/* -------------------- */
/* Foreign keys (safe)  */
/* -------------------- */

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'messages_organization_id_fkey'
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_organization_id_fkey
      FOREIGN KEY (organization_id)
      REFERENCES public.organizations(id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'messages_conversation_id_fkey'
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_conversation_id_fkey
      FOREIGN KEY (conversation_id)
      REFERENCES public.conversations(id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_messages_org_conversation_created
  ON public.messages (organization_id, conversation_id, created_at);

/* -------------------- */
/* Trigger enforcement */
/* -------------------- */

CREATE OR REPLACE FUNCTION public.set_message_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT c.organization_id
      INTO NEW.organization_id
    FROM public.conversations c
    WHERE c.id = NEW.conversation_id;
  END IF;

  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'messages.organization_id is required and could not be derived from conversation_id';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_message_organization_id ON public.messages;

CREATE TRIGGER trg_set_message_organization_id
BEFORE INSERT OR UPDATE OF conversation_id, organization_id
ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.set_message_organization_id();

/* ========================================================================== */
/* WORKFLOW_LOGS: ADD organization_id + BACKFILL + ENFORCE                     */
/* ========================================================================== */

ALTER TABLE public.workflow_logs
  ADD COLUMN IF NOT EXISTS organization_id UUID;

UPDATE public.workflow_logs wl
SET organization_id = c.organization_id
FROM public.conversations c
WHERE wl.organization_id IS NULL
  AND wl.conversation_id = c.id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.workflow_logs WHERE organization_id IS NULL) THEN
    RAISE EXCEPTION 'Phase6: workflow_logs.organization_id could not be backfilled.';
  END IF;
END $$;

ALTER TABLE public.workflow_logs
  ALTER COLUMN organization_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workflow_logs_organization_id_fkey'
  ) THEN
    ALTER TABLE public.workflow_logs
      ADD CONSTRAINT workflow_logs_organization_id_fkey
      FOREIGN KEY (organization_id)
      REFERENCES public.organizations(id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workflow_logs_conversation_id_fkey'
  ) THEN
    ALTER TABLE public.workflow_logs
      ADD CONSTRAINT workflow_logs_conversation_id_fkey
      FOREIGN KEY (conversation_id)
      REFERENCES public.conversations(id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_workflow_logs_org_conversation_created
  ON public.workflow_logs (organization_id, conversation_id, created_at);

/* ========================================================================== */
/* RLS SAFETY (ENABLE ONLY — NO POLICY CHANGES)                                */
/* ========================================================================== */

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_logs ENABLE ROW LEVEL SECURITY;

COMMIT;
