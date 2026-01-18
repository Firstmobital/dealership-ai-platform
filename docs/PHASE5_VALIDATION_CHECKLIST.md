# Phase 5 — Validation Checklist

## 1) DB push
- `supabase db push` applies `20260118160000_phase5_scale_and_reliability.sql`

## 2) Index presence
Run:
```sql
select indexname, tablename
from pg_indexes
where indexname in (
  'conversations_org_updated_at_idx',
  'messages_org_conversation_order_at_idx',
  'messages_org_created_at_idx',
  'campaign_messages_claim_idx',
  'knowledge_articles_org_updated_at_idx'
);
```

## 3) Embedding cache fills
After repeated similar user queries:
```sql
select organization_id, model, count(*) as cached
from public.ai_embeddings_cache
group by 1,2
order by cached desc;
```

## 4) Rate limit enforcement
Set a temporary tight limit for one org:
```sql
insert into public.ai_org_rate_limits (organization_id, enabled, window_seconds, max_requests, max_tokens)
values ('<org_uuid>', true, 60, 3, 3000)
on conflict (organization_id) do update
set enabled=true, window_seconds=60, max_requests=3, max_tokens=3000;
```
Trigger more than 3 AI calls inside 60 seconds → expect HTTP 429 with `rate_limit_exceeded`.

## 5) Background job primitives
Claim test (service role):
```sql
select * from public.claim_background_jobs(5, 'worker-1', 300);
```
