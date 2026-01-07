-- Production hotfix (2026-01-07)
-- Keep filename for migration history consistency.
-- This view is the contract used by the PSF UI.

CREATE OR REPLACE VIEW public.psf_cases_view AS
SELECT
  pc.id,
  pc.organization_id,
  pc.campaign_id,
  c.name AS campaign_name,
  pc.conversation_id,
  pc.phone,

  -- Feedback state
  pc.sentiment,
  pc.ai_summary,

  -- Resolution
  pc.resolution_status,
  pc.action_required,

  -- Reminder tracking (UI expects these names)
  pc.reminder_count AS reminders_sent_count,
  pc.last_reminder_at AS last_reminder_sent_at,

  -- Customer replies
  pc.first_customer_reply_at,
  pc.last_customer_reply_at,

  -- Delivery
  pc.initial_sent_at,

  pc.created_at,
  pc.updated_at
FROM public.psf_cases pc
LEFT JOIN public.campaigns c ON c.id = pc.campaign_id;
