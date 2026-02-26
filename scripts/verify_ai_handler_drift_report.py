from pathlib import Path
import hashlib

ROOT = Path("supabase/functions/ai-handler")
SOURCE = Path("docs/ai-handler-monolith-index(reference only).ts")

segments = [
    ("clients.ts", 5, 7),
    ("main_handler.ts", 8, 20),
    ("env.ts", 21, 49),
    ("clients.ts", 50, 59),
    ("logging.ts", 60, 112),
    ("offers_pricing.ts", 113, 304),
    ("safe_helpers.ts", 305, 361),
    ("offers_pricing.ts", 362, 720),
    ("service_ticket.ts", 721, 794),
    ("intent_heuristics.ts", 795, 1213),
    ("history.ts", 1214, 1389),
    ("trace.ts", 1390, 1434),
    ("offers_pricing.ts", 1435, 1499),
    ("main_handler.ts", 1500, 1595),
    ("entity_memory.ts", 1596, 1669),
    ("history.ts", 1670, 1785),
    ("psf.ts", 1786, 1841),
    ("wallet_quota.ts", 1842, 1893),
    ("main_handler.ts", 1894, 1981),
    ("schema_enforcement.ts", 1982, 2046),
    ("main_handler.ts", 2047, 2098),
    ("entity_memory.ts", 2099, 2199),
    ("wallet_quota.ts", 2200, 2267),
    ("main_handler.ts", 2268, 2369),
    ("campaign.ts", 2370, 2447),
    ("personality.ts", 2448, 2478),
    ("text_normalize.ts", 2479, 2496),
    ("kb_semantic.ts", 2497, 3397),
    ("kb_lexical.ts", 3398, 3482),
    ("main_handler.ts", 3483, 3955),
    ("urgency.ts", 3956, 4068),
    ("main_handler.ts", 4124, 6462),
]


def sha(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


if not SOURCE.exists():
    print("STATUS=ERROR")
    print("REASON=SOURCE_MONOLITH_NOT_FOUND")
    raise SystemExit(2)

source_lines = SOURCE.read_text(encoding="utf-8").splitlines(keepends=True)

module_lines = {}
for mod in sorted({m for m, _, _ in segments}):
    p = ROOT / mod
    if not p.exists():
        print("STATUS=ERROR")
        print(f"REASON=MODULE_NOT_FOUND:{mod}")
        raise SystemExit(3)
    module_lines[mod] = p.read_text(encoding="utf-8").splitlines(keepends=True)

cursors = {m: 0 for m in module_lines.keys()}

mismatches = []
for idx, (mod, a, b) in enumerate(segments, start=1):
    n = b - a + 1
    ref_block = source_lines[a - 1 : b]

    c = cursors[mod]
    out_block = module_lines[mod][c : c + n]
    cursors[mod] = c + n

    rb = "".join(ref_block).encode("utf-8")
    ob = "".join(out_block).encode("utf-8")

    if sha(rb) != sha(ob):
        # find first differing line in this block
        first_line = None
        limit = min(len(ref_block), len(out_block))
        for i in range(limit):
            if ref_block[i] != out_block[i]:
                first_line = i
                break
        if first_line is None and len(ref_block) != len(out_block):
            first_line = limit

        ref_preview = ""
        out_preview = ""
        if first_line is not None:
            start = max(0, first_line - 1)
            end = min(limit, first_line + 2)
            ref_preview = "".join(ref_block[start:end]).replace("\n", "\\n")
            out_preview = "".join(out_block[start:end]).replace("\n", "\\n")

        mismatches.append(
            {
                "idx": idx,
                "file": mod,
                "range": f"{a}-{b}",
                "ref_sha": sha(rb),
                "out_sha": sha(ob),
                "first_line_offset": first_line,
                "ref_preview": ref_preview[:280],
                "out_preview": out_preview[:280],
            }
        )

print(f"TOTAL_SEGMENTS={len(segments)}")
print(f"MISMATCH_COUNT={len(mismatches)}")

for mm in mismatches:
    print("---")
    print(f"BLOCK_INDEX={mm['idx']}")
    print(f"FILE={mm['file']}")
    print(f"LINE_RANGE={mm['range']}")
    print(f"REF_SHA256={mm['ref_sha']}")
    print(f"OUT_SHA256={mm['out_sha']}")
    print(f"FIRST_DIFF_LINE_OFFSET={mm['first_line_offset']}")
    print(f"REF_PREVIEW={mm['ref_preview']}")
    print(f"OUT_PREVIEW={mm['out_preview']}")

if mismatches:
    print("STATUS=FAILED")
else:
    print("STATUS=PASSED")
