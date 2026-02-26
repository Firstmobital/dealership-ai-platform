from pathlib import Path
import re

ROOT = Path("supabase/functions/ai-handler")
SOURCE = Path("docs/ai-handler-monolith-index(reference only).ts")

TARGET_SEGMENTS = {
    "campaign.ts": [(2370, 2447)],
    "clients.ts": [(5, 7), (50, 59)],
    "entity_memory.ts": [(1596, 1669), (2099, 2199)],
    "env.ts": [(21, 49)],
    "history.ts": [(1214, 1389), (1670, 1785)],
    "kb_lexical.ts": [(3398, 3482)],
    "kb_semantic.ts": [(2497, 3397)],
    "main_handler.ts": [(8, 20), (1500, 1595), (1894, 1981), (2047, 2098), (2268, 2369), (3483, 3955), (4124, 6462)],
    "offers_pricing.ts": [(113, 304), (362, 720), (1435, 1499)],
    "personality.ts": [(2448, 2478)],
    "psf.ts": [(1786, 1841)],
    "safe_helpers.ts": [(305, 361)],
    "trace.ts": [(1390, 1434)],
    "wallet_quota.ts": [(1842, 1893), (2200, 2267)],
}

EXPORT_RE = re.compile(
    r"^\s*export\s+(?:async\s+function|function|const|type)\s+([A-Za-z_][A-Za-z0-9_]*)\b",
    re.M,
)


def strip_imports_and_refs(text: str) -> str:
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

        out.append(line)

    return "".join(out)


def adapt_main_handler_body(body: str) -> str:
    if "export async function mainHandler(" in body:
        return body

    marker = "    // 1) Load conversation"
    if marker in body:
        insert = (
            "export async function mainHandler(params: {\n"
            "  req: Request;\n"
            "  request_id: string;\n"
            "  trace_id: string;\n"
            "  baseLogger: ReturnType<typeof createLogger>;\n"
            "  conversation_id: string;\n"
            "  user_message: string;\n"
            "}): Promise<Response> {\n"
            "  const { req, request_id, trace_id, baseLogger, conversation_id, user_message } =\n"
            "    params;\n"
            "  try {\n"
        )
        body = body.replace(marker, insert + "\n" + marker, 1)

    body = body.rstrip()
    if body.endswith("});"):
        body = body[:-3].rstrip() + "\n}\n"
    elif not body.endswith("}\n"):
        body = body + "\n"

    return body


def extract_prelude(lines: list[str]) -> str:
    out: list[str] = []
    i = 0
    in_import = False

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if in_import:
            out.append(line)
            if stripped.endswith(";"):
                in_import = False
            i += 1
            continue

        if stripped.startswith("/// <reference path="):
            out.append(line)
            i += 1
            continue

        if line.lstrip().startswith("import "):
            out.append(line)
            if not stripped.endswith(";"):
                in_import = True
            i += 1
            continue

        if stripped == "":
            out.append(line)
            i += 1
            continue

        break

    return "".join(out)


def add_export_if_needed(payload: str, symbol: str) -> str:
    patterns = [
        rf"^(\s*)(async\s+function\s+{re.escape(symbol)}\b)",
        rf"^(\s*)(function\s+{re.escape(symbol)}\b)",
        rf"^(\s*)(const\s+{re.escape(symbol)}\b)",
        rf"^(\s*)(type\s+{re.escape(symbol)}\b)",
    ]

    updated = payload
    for p in patterns:
        updated2, count = re.subn(p, r"\1export \2", updated, count=1, flags=re.M)
        if count > 0:
            return updated2
    return updated


def main() -> None:
    if not SOURCE.exists():
        raise FileNotFoundError(f"Reference file not found: {SOURCE}")

    source_lines = SOURCE.read_text(encoding="utf-8").splitlines(keepends=True)

    for file_name, ranges in TARGET_SEGMENTS.items():
        path = ROOT / file_name
        if not path.exists():
            raise FileNotFoundError(f"Target file not found: {path}")

        current_text = path.read_text(encoding="utf-8")
        current_lines = current_text.splitlines(keepends=True)

        prelude = extract_prelude(current_lines)
        exported_symbols = set(EXPORT_RE.findall(current_text))

        body_parts: list[str] = []
        for start, end in ranges:
            body_parts.append("".join(source_lines[start - 1 : end]))
        body = "".join(body_parts)
        body = strip_imports_and_refs(body)
        if file_name == "main_handler.ts":
            body = adapt_main_handler_body(body)

        for sym in sorted(exported_symbols):
            body = add_export_if_needed(body, sym)

        prelude_clean = prelude
        if prelude_clean and not prelude_clean.endswith("\n"):
            prelude_clean += "\n"

        if prelude_clean and body and not prelude_clean.endswith("\n\n"):
            prelude_clean += "\n"

        new_text = f"{prelude_clean}{body}".rstrip("\n") + "\n"
        path.write_text(new_text, encoding="utf-8")
        print(f"RECONCILED={file_name}")


if __name__ == "__main__":
    main()
