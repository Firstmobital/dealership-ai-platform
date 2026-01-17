# PHASE 2 — Validation Checklist

## A) Secrets / Env
- [ ] Supabase Edge Secrets contain `INTERNAL_API_KEY` (non-empty)
- [ ] Supabase Edge Secrets contain `SUPABASE_ANON_KEY` (for user JWT verification in edge functions)

## B) AI Grounding (KB)
- [ ] Ingest 1 knowledge article containing model variants/offer details for a vehicle (e.g., Altroz variants)
- [ ] Ensure chunks are embedded (knowledge_chunks populated)
- [ ] Send an inbound message: "Tell me more" after a campaign/offer message
- [ ] Confirm AI response **pulls details from KB** (variants/features) and does **not fabricate**
- [ ] Send a message unrelated to KB and confirm AI asks 1 clarifying question or hands off (no KB hallucination)

## C) KB Weak-Match Fail-Closed
- [ ] Ask a question with no KB coverage
- [ ] Confirm ai-handler does **not** inject weak KB context (look for log: `[kb] semantic match too weak; not injecting`)

## D) Phase 1 Coverage Patch
- [ ] Call `whatsapp-test-send` without `x-internal-api-key` -> expect `403`
- [ ] Call `psf-create-reminder` without `x-internal-api-key` -> expect `403`
- [ ] Call `contact-bulk-upload` with valid user JWT not in org -> expect `403/Forbidden`
- [ ] Call `contact-bulk-upload` with org `agent` role -> expect `403/Forbidden`
- [ ] Call `whatsapp-template-sync` with org `admin` role -> expect `200` (if Meta creds configured)
- [ ] Call `kb-save-from-unanswered` with org `admin` role -> expect `200`
