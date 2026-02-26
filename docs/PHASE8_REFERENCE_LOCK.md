# PHASE 8 — Reference Lock

Date: 2026-02-26

## Lock Scope

This lock covers mechanical decomposition integrity for:
- Source monolith: `supabase/functions/ai-handler/index.ts`
- Moved module files under: `supabase/functions/ai-handler/`

Verification mode is block-level (not full monolith reconstruction hash):
1. For each moved block, hash original locked source range.
2. Hash corresponding extracted module block.
3. Require exact SHA256 match.
4. Stop on first mismatch.
5. Validate line coverage accounting (moved + retained == original), with no duplication and no missing lines.

## Locked Source Identity

- `ORIGINAL_AI_HANDLER_HASH`: `0faf5d9188c61afa158a3f08a308bb76b48ac51794c83fc76f895e894f69568b`
- `ORIGINAL_COMMIT`: `1ce5b27fede249db71b9e8591fad25dc98a303f3`
- `ORIGINAL_LINES`: `6462`

## Coverage Lock

- `MOVED_LINES`: `6403`
- `RETAINED_LINES`: `59`
- `DECLARED_TOTAL`: `6462`
- `COVERAGE_UNIQUE`: `6462`
- `DUPLICATE_LINE_COUNT`: `0`
- `MISSING_LINE_COUNT`: `0`

## Integrity Result (Latest Run)

- `STATUS`: `PASSED`
- `ALL_MOVED_BLOCK_HASHES_MATCH`: `YES`
- `NO_DUPLICATION`: `YES`
- `NO_MISSING_COVERAGE`: `YES`

## Repro Command

```bash
python3 scripts/verify_ai_handler_blocks.py
```

## Notes

- This Phase 8 lock intentionally does **not** use a reconstructed full-file hash.
- Validation authority is block-level extraction equality against the locked original commit.
