# Phase 4 - Validation Checklist

## 1) DB migration applied
- supabase db push
- Verify tables exist: ai_turn_traces, message_delivery_events, replay_requests
- Verify RLS enabled on all 3 tables

## 2) AI trace present
- Trigger ai-handler for a conversation
- Check ai_turn_traces row created with request_id, org_id, conversation_id
- Verify kb_used + kb_chunks populated when KB hits
- Verify status becomes succeeded or failed

## 3) Delivery event timeline
- Send via whatsapp-send (agent inbox) and ensure message_delivery_events has send_attempt and sent/failed
- Trigger webhook receipts to whatsapp-inbound and confirm delivered/read events logged
- Run campaign-dispatch and confirm claimed/send_attempt/sent/retried/failed events

## 4) Debug views
- Query ai_failures_last_24h_view and delivery_failures_last_24h_view after forced failures
- Query stuck_campaign_messages_view for any rows that are locked or overdue

## 5) Replay requests
- Insert replay_requests row via UI/user client and confirm RLS allows only org members
- Confirm service-role worker can update status/result
