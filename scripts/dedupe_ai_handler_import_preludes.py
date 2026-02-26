from pathlib import Path

ROOT = Path("supabase/functions/ai-handler")
FILES = [
    "campaign.ts",
    "clients.ts",
    "entity_memory.ts",
    "env.ts",
    "history.ts",
    "kb_lexical.ts",
    "kb_semantic.ts",
    "main_handler.ts",
    "offers_pricing.ts",
    "personality.ts",
    "psf.ts",
    "safe_helpers.ts",
    "trace.ts",
    "wallet_quota.ts",
]


def consume_import_stmt(lines: list[str], start: int) -> tuple[str, int]:
    i = start
    chunk: list[str] = []
    while i < len(lines):
        chunk.append(lines[i])
        if lines[i].strip().endswith(";"):
            i += 1
            break
        i += 1
    return "".join(chunk), i


def dedupe_file(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines(keepends=True)

    i = 0
    prelude_chunks: list[str] = []
    while i < len(lines):
        stripped = lines[i].strip()
        line = lines[i]

        if stripped.startswith("/// <reference path="):
            prelude_chunks.append(line)
            i += 1
            continue

        if line.lstrip().startswith("import "):
            stmt, next_i = consume_import_stmt(lines, i)
            prelude_chunks.append(stmt)
            i = next_i
            continue

        if stripped == "":
            prelude_chunks.append(line)
            i += 1
            continue

        break

    body = "".join(lines[i:])

    seen = set()
    deduped: list[str] = []
    for ch in prelude_chunks:
        key = ch.strip()
        if not key:
            deduped.append(ch)
            continue
        if key in seen:
            continue
        seen.add(key)
        deduped.append(ch)

    prelude = "".join(deduped)
    if prelude and not prelude.endswith("\n"):
        prelude += "\n"
    if prelude and body and not prelude.endswith("\n\n"):
        prelude += "\n"

    path.write_text((prelude + body).rstrip("\n") + "\n", encoding="utf-8")
    print(f"DEDUPED={path.name}")


def main() -> None:
    for f in FILES:
        p = ROOT / f
        if p.exists():
            dedupe_file(p)


if __name__ == "__main__":
    main()
