from pathlib import Path
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

fn_re = re.compile(r"^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\b", re.M)
type_re = re.compile(r"^\s*(?:export\s+)?type\s+([A-Za-z_][A-Za-z0-9_]*)\b", re.M)
const_re = re.compile(r"^\s*(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=", re.M)

if not SOURCE.exists():
    print("STATUS=ERROR")
    print("REASON=SOURCE_MONOLITH_NOT_FOUND")
    sys.exit(2)

source_lines = SOURCE.read_text(encoding="utf-8").splitlines(keepends=True)

symbols_by_module = {}
for mod, a, b in segments:
    text = "".join(source_lines[a - 1 : b])
    names = set()
    for rx in (fn_re, type_re, const_re):
        names.update(rx.findall(text))
    if names:
        symbols_by_module.setdefault(mod, set()).update(names)

missing = []
for mod, names in sorted(symbols_by_module.items()):
    path = ROOT / mod
    if not path.exists():
        missing.append((mod, "<MODULE_FILE_MISSING>"))
        continue
    module_text = path.read_text(encoding="utf-8")

    for name in sorted(names):
        decl = re.search(
            rf"^\s*(?:export\s+)?(?:async\s+)?(?:function|const|type)\s+{re.escape(name)}\b",
            module_text,
            re.M,
        )
        if not decl:
            missing.append((mod, name))

print(f"MODULES_CHECKED={len(symbols_by_module)}")
print(f"DECLARATIONS_EXPECTED={sum(len(v) for v in symbols_by_module.values())}")
print(f"DECLARATIONS_MISSING={len(missing)}")

if missing:
    print("STATUS=FAILED")
    for mod, name in missing[:200]:
        print(f"MISSING={mod}:{name}")
    sys.exit(3)

print("STATUS=PASSED")
print("SYMBOL_COVERAGE=OK")
