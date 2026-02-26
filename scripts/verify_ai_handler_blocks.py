from pathlib import Path
import hashlib
import subprocess
import sys
import os

os.chdir(Path(__file__).resolve().parent.parent)

ROOT = Path("supabase/functions/ai-handler")
TARGET = ROOT / "index.ts"
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


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def first_diff(a: bytes, b: bytes) -> int:
    m = min(len(a), len(b))
    i = 0
    while i < m and a[i] == b[i]:
        i += 1
    if i < m:
        return i
    return m if len(a) != len(b) else -1


commits = subprocess.check_output(
    ["git", "rev-list", "--all", "--", str(TARGET)], text=True
).splitlines()
orig_bytes = None
orig_commit = None
for c in commits:
    try:
        b = subprocess.check_output(["git", "show", f"{c}:{TARGET.as_posix()}"])
    except subprocess.CalledProcessError:
        continue
    if sha(b) == LOCKED_ORIG_HASH:
        orig_bytes = b
        orig_commit = c
        break

if orig_bytes is None:
    print("STATUS=ERROR")
    print("REASON=ORIGINAL_HASH_NOT_FOUND_IN_GIT_HISTORY")
    sys.exit(2)

orig_lines = orig_bytes.decode("utf-8").splitlines(keepends=True)
orig_line_count = len(orig_lines)

covered = []
for _, a, b, _ in segments:
    covered.extend(range(a, b + 1))

unique = set(covered)
expected = set(range(1, orig_line_count + 1))
missing = sorted(expected - unique)
dups = len(covered) - len(unique)

moved_count = sum((b - a + 1) for _, a, b, k in segments if k == "moves")
retained_count = sum((b - a + 1) for _, a, b, k in segments if k == "stays")

print(f"ORIGINAL_COMMIT={orig_commit}")
print(f"ORIGINAL_LINES={orig_line_count}")
print(f"MOVED_LINES={moved_count}")
print(f"RETAINED_LINES={retained_count}")
print(f"DECLARED_TOTAL={moved_count + retained_count}")
print(f"COVERAGE_UNIQUE={len(unique)}")
print(f"DUPLICATE_LINE_COUNT={dups}")
print(f"MISSING_LINE_COUNT={len(missing)}")

if (moved_count + retained_count) != orig_line_count:
    print("STATUS=FAILED")
    print("FAIL_REASON=LINE_COUNT_MISMATCH")
    sys.exit(3)
if dups != 0:
    print("STATUS=FAILED")
    print("FAIL_REASON=DUPLICATE_COVERAGE")
    print(f"EXTRA_COVERED_COUNT={dups}")
    sys.exit(4)
if missing:
    print("STATUS=FAILED")
    print("FAIL_REASON=MISSING_COVERAGE")
    print(f"FIRST_MISSING_LINE={missing[0]}")
    sys.exit(5)

module_lines = {}
for fname in sorted({s[0] for s in segments if s[3] == "moves"}):
    p = ROOT / fname
    if not p.exists():
        print("STATUS=FAILED")
        print("FAIL_REASON=MODULE_FILE_MISSING")
        print(f"MODULE={fname}")
        sys.exit(6)
    module_lines[fname] = p.read_text(encoding="utf-8").splitlines(keepends=True)

cursors = {k: 0 for k in module_lines.keys()}

for idx, (fname, a, b, kind) in enumerate(segments, start=1):
    if kind != "moves":
        continue

    n = b - a + 1
    orig_block = "".join(orig_lines[a - 1 : b]).encode("utf-8")

    c = cursors[fname]
    extracted_text = "".join(module_lines[fname][c : c + n])
    cursors[fname] = c + n
    extracted_block = extracted_text.encode("utf-8")

    h1 = sha(orig_block)
    h2 = sha(extracted_block)

    if h1 != h2:
        print("STATUS=FAILED")
        print("FAIL_REASON=BLOCK_HASH_MISMATCH")
        print(f"BLOCK_INDEX={idx}")
        print(f"FILE={fname}")
        print(f"LINE_RANGE={a}-{b}")
        print(f"ORIG_SHA256={h1}")
        print(f"EXTRACTED_SHA256={h2}")
        print(f"FIRST_DIFFERING_BYTE={first_diff(orig_block, extracted_block)}")
        print(f"ORIG_BLOCK_BYTES={len(orig_block)}")
        print(f"EXTRACTED_BLOCK_BYTES={len(extracted_block)}")
        sys.exit(7)

for fname, lines in module_lines.items():
    consumed = cursors[fname]
    if consumed != len(lines):
        trailing = "".join(lines[consumed:]).encode("utf-8")
        print("STATUS=FAILED")
        print("FAIL_REASON=DUPLICATION_OR_EXTRA_CONTENT_IN_MODULE")
        print(f"MODULE={fname}")
        print(f"UNCONSUMED_LINES={len(lines) - consumed}")
        print(f"UNCONSUMED_BYTES={len(trailing)}")
        sys.exit(8)

print("STATUS=PASSED")
print("ALL_MOVED_BLOCK_HASHES_MATCH=YES")
print("NO_DUPLICATION=YES")
print("NO_MISSING_COVERAGE=YES")
