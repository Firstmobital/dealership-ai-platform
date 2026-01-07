-- Phase 5.4 — Wallet Alerts & Thresholds
-- Step 1: Add balance threshold columns to wallets

ALTER TABLE wallets
ADD COLUMN IF NOT EXISTS low_balance_threshold NUMERIC NOT NULL DEFAULT 50,
ADD COLUMN IF NOT EXISTS critical_balance_threshold NUMERIC NOT NULL DEFAULT 10;

-- Safety check: critical must always be <= low
ALTER TABLE wallets
ADD CONSTRAINT wallet_threshold_sanity_check
CHECK (critical_balance_threshold <= low_balance_threshold);
