# Phase 4 - Observability and Debugging

## Database
Migration added:
- supabase/migrations/20260118130000_phase4_observability_and_debugging.sql

Creates tables:
- public.ai_turn_traces
- public.message_delivery_events
- public.replay_requests

Creates views:
- public.ai_failures_last_24h_view
- public.delivery_failures_last_24h_view
- public.stuck_campaign_messages_view

## Edge functions
- ai-handler: writes ai_turn_traces (start, KB stats, finish/fail)
- whatsapp-send: logs message_delivery_events for send_attempt/sent/failed
- whatsapp-inbound: logs message_delivery_events for receipt events
- campaign-dispatch: logs message_delivery_events for claimed/send_attempt/sent/retried/failed
