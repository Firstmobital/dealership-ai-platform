from pathlib import Path
import hashlib
import re
import sys

ROOT = Path("supabase/functions/ai-handler")
SOURCE = Path("docs/ai-handler-monolith-index(reference only).ts")

SEGMENTS = {
    "env.ts": [(21, 49)],
    "clients.ts": [(5, 7), (50, 59)],
    "logging.ts": [(60, 112)],
    "safe_helpers.ts": [(305, 361)],
    "offers_pricing.ts": [(113, 304), (362, 720), (1435, 1499)],
    "service_ticket.ts": [(721, 794)],
    "intent_heuristics.ts": [(795, 1213)],
    "history.ts": [(1214, 1389), (1670, 1785)],
    "trace.ts": [(1390, 1434)],
    "entity_memory.ts": [(1596, 1669), (2099, 2199)],
    "psf.ts": [(1786, 1841)],
    "wallet_quota.ts": [(1842, 1893), (2200, 2267)],
    "schema_enforcement.ts": [(1982, 2046)],
    "campaign.ts": [(2370, 2447)],
    "personality.ts": [(2448, 2478)],
    "text_normalize.ts": [(2479, 2496)],
    "kb_semantic.ts": [(2497, 3397)],
    "kb_lexical.ts": [(3398, 3482)],
    "urgency.ts": [(3956, 4068)],
    "main_handler.ts": [(8, 20), (1500, 1595), (1894, 1981), (2047, 2098), (2268, 2369), (3483, 3955), (4124, 6462)],
}

DECL_RE = re.compile(
    r"^(?P<kind>(?:async\s+)?function|type|const)\s+(?P<name>[A-Za-z_][A-Za-z0-9_]*)\b",
    re.M,
)


def sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def strip_imports_refs_exports(text: str) -> str:
    lines = text.splitlines(keepends=True)
    out: list[str] = []
    in_import = False

    for line in lines:
        stripped = line.strip()

        if stripped.startswith("/// <reference path="):
            continue

        if in_import:
            if stripped.endswith(";"):
                in_import = False
            continue

        if line.lstrip().startswith("import "):
            if not stripped.endswith(";"):
                in_import = True
            continue

        line = re.sub(
            r"^(\s*)export\s+(?=(?:async\s+)?function\b|type\b|const\b)",
            r"\1",
            line,
        )
        out.append(line)

    return "".join(out)


def normalize_text(text: str) -> str:
    text = text.replace("\r\n", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_blocks(text: str) -> dict[str, str]:
    matches = list(DECL_RE.finditer(text))
    blocks: dict[str, str] = {}

    def function_block_end(src: str, start_pos: int) -> int:
        brace_start = src.find("{", start_pos)
        if brace_start == -1:
            return start_pos

        depth = 0
        i = brace_start
        while i < len(src):
            ch = src[i]
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return i + 1
            i += 1
        return len(src)

    for i, m in enumerate(matches):
        kind = m.group("kind")
        name = m.group("name")
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)

        if "function" in kind:
            fn_end = function_block_end(text, m.start())
            if fn_end > start:
                end = min(end, fn_end)

        body = text[start:end]
        blocks[name] = normalize_text(body)

    return blocks


def build_expected_by_file(source_lines: list[str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for file_name, ranges in SEGMENTS.items():
        chunks: list[str] = []
        for start, end in ranges:
            chunks.extend(source_lines[start - 1 : end])
        out[file_name] = "".join(chunks)
    return out


def main() -> None:
    if not SOURCE.exists():
        print("STATUS=ERROR")
        print("REASON=SOURCE_NOT_FOUND")
        sys.exit(2)

    source_lines = SOURCE.read_text(encoding="utf-8").splitlines(keepends=True)
    expected_by_file = build_expected_by_file(source_lines)

    file_drift: list[tuple[str, int, int, list[str], list[str]]] = []

    for file_name, expected_raw in sorted(expected_by_file.items()):
        actual_path = ROOT / file_name
        if not actual_path.exists():
            file_drift.append((file_name, 0, 0, ["<file missing>"], []))
            continue

        actual_raw = actual_path.read_text(encoding="utf-8")

        expected_norm = strip_imports_refs_exports(expected_raw)
        actual_norm = strip_imports_refs_exports(actual_raw)

        expected_blocks = extract_blocks(expected_norm)
        actual_blocks = extract_blocks(actual_norm)

        expected_names = set(expected_blocks.keys())
        actual_names = set(actual_blocks.keys())

        missing = sorted(expected_names - actual_names)
        extra = sorted(actual_names - expected_names)
        if file_name == "main_handler.ts":
            extra = [x for x in extra if x != "mainHandler"]

        changed = []
        for name in sorted(expected_names & actual_names):
            if sha(expected_blocks[name]) != sha(actual_blocks[name]):
                changed.append(name)

        if missing or extra or changed:
            file_drift.append((file_name, len(changed), len(missing), missing, extra))
            print("---")
            print(f"FILE={file_name}")
            print(f"CHANGED_BLOCKS={len(changed)}")
            if changed:
                print("CHANGED_NAMES=" + ",".join(changed[:60]))
            print(f"MISSING_BLOCKS={len(missing)}")
            if missing:
                print("MISSING_NAMES=" + ",".join(missing[:60]))
            print(f"EXTRA_BLOCKS={len(extra)}")
            if extra:
                print("EXTRA_NAMES=" + ",".join(extra[:60]))

    print(f"FILES_CHECKED={len(expected_by_file)}")
    print(f"FILES_WITH_DRIFT={len(file_drift)}")

    if file_drift:
        print("STATUS=FAILED")
        sys.exit(7)

    print("STATUS=PASSED")


if __name__ == "__main__":
    main()
