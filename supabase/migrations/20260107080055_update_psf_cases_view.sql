CREATE OR REPLACE VIEW psf_cases_view AS
SELECT
  pc.id,
  pc.organization_id,
  pc.campaign_id,
  c.name AS campaign_name,
  pc.conversation_id,
  pc.phone,
  pc.sent_at,
  pc.first_customer_reply_at,
  pc.resolved_at,
  pc.resolution_status,
  pc.action_required,
  pc.last_reminder_at,
  pc.reminder_count,
  pc.created_at,
  pc.updated_at
FROM psf_cases pc
LEFT JOIN campaigns c ON c.id = pc.campaign_id;
