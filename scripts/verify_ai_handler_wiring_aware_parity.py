from pathlib import Path
import hashlib
import re
import sys

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


def strip_leading_split_scaffolding(lines: list[str]) -> list[str]:
    i = 0
    dropped_any = False
    while i < len(lines):
        s = lines[i].strip()
        if s.startswith('/// <reference path='):
            i += 1
            dropped_any = True
            continue
        if s.startswith('import '):
            i += 1
            dropped_any = True
            continue
        if dropped_any and s == '':
            i += 1
            continue
        break
    return lines[i:]


def strip_imports_and_refs(lines: list[str]) -> list[str]:
    out: list[str] = []
    in_import_block = False

    for line in lines:
        stripped = line.strip()

        if stripped.startswith('/// <reference path='):
            continue

        if in_import_block:
            if stripped.endswith(';'):
                in_import_block = False
            continue

        if re.match(r"^\s*import\b", line):
            if not stripped.endswith(';'):
                in_import_block = True
            continue

        out.append(line)

    return out


def normalize_line(line: str) -> str:
    out = line
    out = re.sub(r"^(\s*)export\s+(?=(async\s+function|function|const|type)\b)", r"\1", out)
    return out


def normalize_block(lines: list[str]) -> bytes:
    cleaned = strip_imports_and_refs(lines)
    normalized = [normalize_line(l) for l in cleaned]
    return "".join(normalized).encode("utf-8")


if not SOURCE.exists():
    print("STATUS=ERROR")
    print("REASON=SOURCE_MONOLITH_NOT_FOUND")
    sys.exit(2)

source_lines = SOURCE.read_text(encoding="utf-8").splitlines(keepends=True)

module_lines = {}
for mod in sorted({m for m, _, _ in segments}):
    p = ROOT / mod
    if not p.exists():
        print("STATUS=ERROR")
        print(f"REASON=MODULE_NOT_FOUND:{mod}")
        sys.exit(3)
    lines = p.read_text(encoding="utf-8").splitlines(keepends=True)
    module_lines[mod] = strip_leading_split_scaffolding(lines)

cursors = {m: 0 for m in module_lines.keys()}
mismatches = []

for idx, (mod, start, end) in enumerate(segments, start=1):
    n = end - start + 1
    ref_block = source_lines[start - 1 : end]

    c = cursors[mod]
    out_block = module_lines[mod][c : c + n]
    cursors[mod] = c + n

    ref_norm = normalize_block(ref_block)
    out_norm = normalize_block(out_block)

    if sha(ref_norm) != sha(out_norm):
        mismatches.append((idx, mod, start, end, sha(ref_norm), sha(out_norm)))

print(f"TOTAL_SEGMENTS={len(segments)}")
print(f"MISMATCH_COUNT={len(mismatches)}")

for idx, mod, start, end, ref_sha, out_sha in mismatches[:100]:
    print("---")
    print(f"BLOCK_INDEX={idx}")
    print(f"FILE={mod}")
    print(f"LINE_RANGE={start}-{end}")
    print(f"REF_NORM_SHA256={ref_sha}")
    print(f"OUT_NORM_SHA256={out_sha}")

if mismatches:
    print("STATUS=FAILED")
else:
    print("STATUS=PASSED")
