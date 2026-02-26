from pathlib import Path
import hashlib
import sys

ROOT = Path("supabase/functions/ai-handler")
SOURCE = Path("docs/ai-handler-monolith-index(reference only).ts")
LOCKED_ORIG_HASH = "0faf5d9188c61afa158a3f08a308bb76b48ac51794c83fc76f895e894f69568b"

segments = [
    ("index.ts", 1, 3, "stays"),
    ("index.ts", 4, 4, "stays"),
    ("clients.ts", 5, 7, "moves"),
    ("main_handler.ts", 8, 20, "moves"),
    ("env.ts", 21, 49, "moves"),
    ("clients.ts", 50, 59, "moves"),
    ("logging.ts", 60, 112, "moves"),
    ("offers_pricing.ts", 113, 304, "moves"),
    ("safe_helpers.ts", 305, 361, "moves"),
    ("offers_pricing.ts", 362, 720, "moves"),
    ("service_ticket.ts", 721, 794, "moves"),
    ("intent_heuristics.ts", 795, 1213, "moves"),
    ("history.ts", 1214, 1389, "moves"),
    ("trace.ts", 1390, 1434, "moves"),
    ("offers_pricing.ts", 1435, 1499, "moves"),
    ("main_handler.ts", 1500, 1595, "moves"),
    ("entity_memory.ts", 1596, 1669, "moves"),
    ("history.ts", 1670, 1785, "moves"),
    ("psf.ts", 1786, 1841, "moves"),
    ("wallet_quota.ts", 1842, 1893, "moves"),
    ("main_handler.ts", 1894, 1981, "moves"),
    ("schema_enforcement.ts", 1982, 2046, "moves"),
    ("main_handler.ts", 2047, 2098, "moves"),
    ("entity_memory.ts", 2099, 2199, "moves"),
    ("wallet_quota.ts", 2200, 2267, "moves"),
    ("main_handler.ts", 2268, 2369, "moves"),
    ("campaign.ts", 2370, 2447, "moves"),
    ("personality.ts", 2448, 2478, "moves"),
    ("text_normalize.ts", 2479, 2496, "moves"),
    ("kb_semantic.ts", 2497, 3397, "moves"),
    ("kb_lexical.ts", 3398, 3482, "moves"),
    ("main_handler.ts", 3483, 3955, "moves"),
    ("urgency.ts", 3956, 4068, "moves"),
    ("index.ts", 4069, 4123, "stays"),
    ("main_handler.ts", 4124, 6462, "moves"),
]


def sha(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def first_diff(a: bytes, b: bytes) -> int:
    m = min(len(a), len(b))
    i = 0
    while i < m and a[i] == b[i]:
        i += 1
    if i < m:
        return i
    return m if len(a) != len(b) else -1


if not SOURCE.exists():
    print("STATUS=ERROR")
    print("REASON=SOURCE_MONOLITH_NOT_FOUND")
    sys.exit(2)

source_bytes = SOURCE.read_bytes()
source_hash = sha(source_bytes)
source_lines = SOURCE.read_text(encoding="utf-8").splitlines(keepends=True)

print(f"SOURCE_FILE={SOURCE}")
print(f"SOURCE_SHA256={source_hash}")
print(f"LOCKED_SHA256={LOCKED_ORIG_HASH}")
print(f"SOURCE_LINE_COUNT={len(source_lines)}")
print("SOURCE_HASH_MATCH=" + ("YES" if source_hash == LOCKED_ORIG_HASH else "NO"))

covered = []
for _, a, b, _ in segments:
    covered.extend(range(a, b + 1))

unique = set(covered)
missing = sorted(set(range(1, len(source_lines) + 1)) - unique)
dups = len(covered) - len(unique)

moved_count = sum((b - a + 1) for _, a, b, kind in segments if kind == "moves")
retained_count = sum((b - a + 1) for _, a, b, kind in segments if kind == "stays")

print(f"MOVED_LINES={moved_count}")
print(f"RETAINED_LINES={retained_count}")
print(f"DECLARED_TOTAL={moved_count + retained_count}")
print(f"COVERAGE_UNIQUE={len(unique)}")
print(f"DUPLICATE_LINE_COUNT={dups}")
print(f"MISSING_LINE_COUNT={len(missing)}")

if (moved_count + retained_count) != len(source_lines):
    print("STATUS=FAILED")
    print("FAIL_REASON=LINE_COUNT_MISMATCH")
    sys.exit(3)
if dups != 0:
    print("STATUS=FAILED")
    print("FAIL_REASON=DUPLICATE_COVERAGE")
    sys.exit(4)
if missing:
    print("STATUS=FAILED")
    print("FAIL_REASON=MISSING_COVERAGE")
    print(f"FIRST_MISSING_LINE={missing[0]}")
    sys.exit(5)

module_lines = {}
for fname in sorted({s[0] for s in segments if s[3] == "moves"}):
    path = ROOT / fname
    if not path.exists():
        print("STATUS=FAILED")
        print("FAIL_REASON=MODULE_FILE_MISSING")
        print(f"MODULE={fname}")
        sys.exit(6)
    module_lines[fname] = path.read_text(encoding="utf-8").splitlines(keepends=True)

cursors = {k: 0 for k in module_lines.keys()}

for idx, (fname, start, end, kind) in enumerate(segments, start=1):
    if kind != "moves":
        continue
    n = end - start + 1
    orig_block = "".join(source_lines[start - 1 : end]).encode("utf-8")
    c = cursors[fname]
    extracted_block = "".join(module_lines[fname][c : c + n]).encode("utf-8")
    cursors[fname] = c + n

    h1 = sha(orig_block)
    h2 = sha(extracted_block)
    if h1 != h2:
        print("STATUS=FAILED")
        print("FAIL_REASON=BLOCK_HASH_MISMATCH")
        print(f"BLOCK_INDEX={idx}")
        print(f"FILE={fname}")
        print(f"LINE_RANGE={start}-{end}")
        print(f"ORIG_SHA256={h1}")
        print(f"EXTRACTED_SHA256={h2}")
        print(f"FIRST_DIFFERING_BYTE={first_diff(orig_block, extracted_block)}")
        sys.exit(7)

for fname, lines in module_lines.items():
    consumed = cursors[fname]
    if consumed != len(lines):
        print("STATUS=FAILED")
        print("FAIL_REASON=DUPLICATION_OR_EXTRA_CONTENT_IN_MODULE")
        print(f"MODULE={fname}")
        print(f"UNCONSUMED_LINES={len(lines) - consumed}")
        sys.exit(8)

print("STATUS=PASSED")
print("ALL_MOVED_BLOCK_HASHES_MATCH=YES")
print("NO_DUPLICATION=YES")
print("NO_MISSING_COVERAGE=YES")
