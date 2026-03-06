// supabase/functions/ai-handler/model_normalize.ts
// Deterministic Tata model normalization + detection.
// - No external deps.
// - Conservative: return null if no confident match.

export const CANONICAL_MODEL_TOKENS = [
  "altroz",
  "curvv",
  "curvv-ev",
  "harrier",
  "harrier-ev",
  "nexon",
  "nexon-ev",
  "punch",
  "punch-ev",
  "safari",
  "sierra",
  "tiago",
  "tiago-ev",
  "tigor",
  "xpres-t",
  "xpres-t-ev",
] as const;

export type CanonicalModelToken = (typeof CANONICAL_MODEL_TOKENS)[number];

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * normalizeTextKey
 * - lowercase
 * - strip punctuation
 * - collapse whitespace
 */
export function normalizeTextKey(input: string): string {
  const s = String(input ?? "").toLowerCase();
  // keep letters/numbers/spaces/hyphen/underscore only; turn the rest into spaces
  const cleaned = s.replace(/[^a-z0-9\s_-]+/g, " ");
  return cleaned.replace(/\s+/g, " ").trim();
}

function collapseForComparison(input: string): string {
  // Collapse spaces/hyphens/underscores for alias comparison.
  // Example: "xpres t" -> "xprest"; "curvv-ev" -> "curvvev".
  return normalizeTextKey(input).replace(/[\s_-]+/g, "");
}

function hasExplicitEv(textNorm: string): boolean {
  // Explicit EV signal. Keep narrow/deterministic.
  // Note: we intentionally do NOT treat "electric" as EV here to avoid over-matching
  // random contexts; WhatsApp users usually type "ev".
  return /(^|\b)ev(\b|$)/i.test(textNorm);
}

const BASE_ALIAS_TO_MODEL: Record<
  string,
  Exclude<
    CanonicalModelToken,
    | "curvv-ev"
    | "harrier-ev"
    | "nexon-ev"
    | "punch-ev"
    | "tiago-ev"
    | "xpres-t-ev"
  >
> = {
  // Altroz
  altroz: "altroz",
  altros: "altroz",
  altrozz: "altroz",
  altrz: "altroz",

  // Curvv
  curvv: "curvv",
  curv: "curvv",
  curve: "curvv",

  // Harrier
  harrier: "harrier",
  harier: "harrier",
  harrior: "harrier",
  harrrier: "harrier",

  // Nexon
  nexon: "nexon",
  nexonn: "nexon",
  nexom: "nexon",

  // Punch
  punch: "punch",
  panch: "punch",
  punh: "punch",

  // Safari
  safari: "safari",
  safarii: "safari",
  safary: "safari",

  // Sierra
  sierra: "sierra",
  siera: "sierra",

  // Tiago
  tiago: "tiago",
  tiagoo: "tiago",
  tyago: "tiago",

  // Tigor
  tigor: "tigor",
  tigorr: "tigor",
  tigar: "tigor",

  // Xpres-T / Xpress-T (base; EV handled separately)
  // Collapsed forms like "xpres t"/"xpres-t" => "xprest", "xpress t" => "xpresst".
  xprest: "xpres-t",
  xpresst: "xpres-t",
} as const;

function normalizeExplicitXpresToken(textNorm: string): CanonicalModelToken | null {
  // Handle xpres/xpress t (and optional ev) via regex instead of alias-map.
  // Accept: xpres t, xpress t, xpres-t, xpress-t, and with ev.
  const t = textNorm;
  if (!/(^|\b)(xpres|xpress)\s*[-_]?\s*t(\b|$)/i.test(t)) return null;
  return hasExplicitEv(t) ? "xpres-t-ev" : "xpres-t";
}

/**
 * normalizeVehicleModelToken
 * Turns user/AI/DB model text into a canonical model token when confidently matchable.
 */
export function normalizeVehicleModelToken(input: string | null): string | null {
  if (!isNonEmptyString(input)) return null;

  const textNorm = normalizeTextKey(input);
  if (!textNorm) return null;

  // Fast-path alignment: allow human-entered phrases (e.g., "curv ev")
  // to resolve exactly like message detection.
  const detected = detectVehicleModelFromMessage(textNorm);
  if (detected) return detected;

  // 1) direct canonical match (supports existing hyphenation variants)
  const collapsed = collapseForComparison(textNorm);
  const canonicalCollapsed = new Map<string, CanonicalModelToken>();
  for (const c of CANONICAL_MODEL_TOKENS) canonicalCollapsed.set(collapseForComparison(c), c);
  const direct = canonicalCollapsed.get(collapsed);
  if (direct) return direct;

  // 2) regex for xpres/xpress
  const xpres = normalizeExplicitXpresToken(textNorm);
  if (xpres) return xpres;

  // 3) alias map for base models; EV chosen only if explicit "ev" present
  const base = BASE_ALIAS_TO_MODEL[collapsed as keyof typeof BASE_ALIAS_TO_MODEL];
  if (base) {
    if (hasExplicitEv(textNorm)) {
      // Promote to EV variant when supported.
      if (base === "curvv") return "curvv-ev";
      if (base === "harrier") return "harrier-ev";
      if (base === "nexon") return "nexon-ev";
      if (base === "punch") return "punch-ev";
      if (base === "tiago") return "tiago-ev";
      if (base === "xpres-t") return "xpres-t-ev";
    }
    return base;
  }

  return null;
}

function countModelMatches(textNorm: string): { matches: CanonicalModelToken[]; explicitEv: boolean } {
  const explicitEv = hasExplicitEv(textNorm);

  // Conservative scan. We count only strong-ish mentions.
  const hits: CanonicalModelToken[] = [];

  // Xpres-T special
  const xpres = normalizeExplicitXpresToken(textNorm);
  if (xpres) hits.push(xpres);

  // Word-based hits for base models (with common typos).
  // IMPORTANT: allow an optional trailing "ev" token ("curv ev")
  // while still using word boundaries to avoid substrings.
  const add = (re: RegExp, base: CanonicalModelToken, ev?: CanonicalModelToken) => {
    if (!re.test(textNorm)) return;
    hits.push(explicitEv && ev ? ev : base);
  };

  const optEvTail = String.raw`(?:\s+ev\b)?`;

  add(new RegExp(String.raw`(^|\b)(altroz|altros|altrozz|altrz)\b${optEvTail}`, "i"), "altroz");
  add(new RegExp(String.raw`(^|\b)(curvv|curv|curve)\b${optEvTail}`, "i"), "curvv", "curvv-ev");
  add(new RegExp(String.raw`(^|\b)(harrier|harier|harrior|harrrier)\b${optEvTail}`, "i"), "harrier", "harrier-ev");
  add(new RegExp(String.raw`(^|\b)(nexon|nexonn|nexom)\b${optEvTail}`, "i"), "nexon", "nexon-ev");
  add(new RegExp(String.raw`(^|\b)(punch|panch|punh)\b${optEvTail}`, "i"), "punch", "punch-ev");
  add(new RegExp(String.raw`(^|\b)(safari|safarii|safary)\b${optEvTail}`, "i"), "safari");
  add(new RegExp(String.raw`(^|\b)(sierra|siera)\b${optEvTail}`, "i"), "sierra");
  add(new RegExp(String.raw`(^|\b)(tiago|tiagoo|tyago)\b${optEvTail}`, "i"), "tiago", "tiago-ev");
  add(new RegExp(String.raw`(^|\b)(tigor|tigorr|tigar)\b${optEvTail}`, "i"), "tigor");

  return { matches: hits, explicitEv };
}

/**
 * detectVehicleModelFromMessage
 * Detects a canonical model token from a user message.
 * - Returns null if none or ambiguous (multiple different models mentioned)
 */
export function detectVehicleModelFromMessage(message: string): string | null {
  const textNorm = normalizeTextKey(message);
  if (!textNorm) return null;

  const res = countModelMatches(textNorm);
  const uniq = Array.from(new Set(res.matches));

  // No model mention
  if (!uniq.length) return null;

  // If multiple distinct models are mentioned, treat as ambiguous.
  // (Example: "harrier xpres t")
  if (uniq.length > 1) return null;

  return uniq[0];
}

export const __test__ = {
  collapseForComparison,
};
