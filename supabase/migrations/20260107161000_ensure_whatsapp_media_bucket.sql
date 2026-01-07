-- P0-B: Ensure WhatsApp media bucket exists (idempotent)
-- Only enforces the presence of the bucket record.
-- Storage object policies remain as configured in your project.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'whatsapp-media'
  ) THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('whatsapp-media', 'whatsapp-media', TRUE);
  ELSE
    -- Keep it public, since WhatsApp media URLs must be reachable by Meta servers.
    UPDATE storage.buckets
    SET public = TRUE
    WHERE id = 'whatsapp-media' AND public IS DISTINCT FROM TRUE;
  END IF;
END $$;
