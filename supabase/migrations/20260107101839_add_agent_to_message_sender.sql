-- 2026-01-07
-- P0: Align DB enum with app usage (human agent messages)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'message_sender'
      AND e.enumlabel = 'agent'
  ) THEN
    ALTER TYPE public.message_sender ADD VALUE 'agent';
  END IF;
END $$;
