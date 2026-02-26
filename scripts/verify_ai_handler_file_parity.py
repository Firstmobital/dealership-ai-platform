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


def normalize_text(text: str) -> str:
    lines = text.splitlines(keepends=True)
    out: list[str] = []
    in_import_block = False

    for line in lines:
        stripped = line.strip()

        if stripped.startswith("/// <reference path="):
            continue

        if in_import_block:
            if stripped.endswith(";"):
                in_import_block = False
            continue

        if re.match(r"^\s*import\b", line):
            if not stripped.endswith(";"):
                in_import_block = True
            continue

        line = re.sub(
            r"^(\s*)export\s+(?=(async\s+function|function|const|type)\b)",
            r"\1",
            line,
        )
        out.append(line)

    return "".join(out)


if not SOURCE.exists():
    print("STATUS=ERROR")
    print("REASON=SOURCE_MONOLITH_NOT_FOUND")
    sys.exit(2)

source_lines = SOURCE.read_text(encoding="utf-8").splitlines(keepends=True)

expected_by_file: dict[str, list[str]] = {}
for file_name, start, end in segments:
    expected_by_file.setdefault(file_name, []).extend(source_lines[start - 1 : end])

mismatches: list[tuple[str, str, str]] = []
for file_name, expected_lines in sorted(expected_by_file.items()):
    file_path = ROOT / file_name
    if not file_path.exists():
        mismatches.append((file_name, "<MISSING_FILE>", "<MISSING_FILE>"))
        continue

    expected_norm = normalize_text("".join(expected_lines)).encode("utf-8")
    actual_norm = normalize_text(file_path.read_text(encoding="utf-8")).encode("utf-8")

    if sha(expected_norm) != sha(actual_norm):
        mismatches.append((file_name, sha(expected_norm), sha(actual_norm)))

print(f"FILES_CHECKED={len(expected_by_file)}")
print(f"FILE_MISMATCHES={len(mismatches)}")

for file_name, exp, act in mismatches:
    print("---")
    print(f"FILE={file_name}")
    print(f"EXPECTED_NORM_SHA256={exp}")
    print(f"ACTUAL_NORM_SHA256={act}")

if mismatches:
    print("STATUS=FAILED")
    sys.exit(7)

print("STATUS=PASSED")
