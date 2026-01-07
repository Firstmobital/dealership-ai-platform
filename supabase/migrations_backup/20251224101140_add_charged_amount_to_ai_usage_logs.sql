-- =========================================================
-- Phase 4 — Step 3A: Profit-ready usage logs
-- Add charged_amount to ai_usage_logs
-- =========================================================

alter table public.ai_usage_logs
add column if not exists charged_amount numeric(10,4) not null default 0;

-- Optional: keep default for safety (recommended for now)
-- If you later want to remove default:
-- alter table public.ai_usage_logs alter column charged_amount drop default;
