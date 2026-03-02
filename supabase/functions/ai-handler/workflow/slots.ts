// supabase/functions/ai-handler/workflow/slots.ts
// Deterministic slot extraction for workflow state.
// - No external dependencies.
// - Regex + keyword matching only.
// - Stable, simple return shape.

export type WorkflowSlots = Record<string, unknown>;

// Exported for deterministic tests / slot overwrite heuristics.
export type DetectedModelCandidate = {
  model: string;
  strength: "strong" | "weak";
  reason: string;
  matchedSpan: string;
};

type FuelType = "petrol" | "diesel" | "cng" | "ev";

function norm(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normModelValue(s: unknown): string {
  // Normalize model values for comparisons.
  // Keep hyphens and collapse whitespace.
  return String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*/g, "-")
    .trim();
}

function uniqueStable<T>(arr: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const x of arr) {
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

function setIfChanged(next: WorkflowSlots, k: string, v: unknown): boolean {
  const prev = next[k];
  // shallow equality is enough here (values are primitives/short strings)
  if (prev === v) return false;
  next[k] = v;
  return true;
}

function tokenize(s: string): string[] {
  // Keep hyphens in the source string but also split into words.
  return s
    .replace(/[^a-z0-9\s-]+/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function hasNegationNear(text: string, needle: string): boolean {
  // Detect patterns like:
  // - "not cng"
  // - "no cng"
  // - "dont want cng" / "don't want cng"
  // - "anything but cng" / "except cng"
  // This is intentionally simple/deterministic.
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `(?:\\bnot\\b|\\bno\\b|\\bdon['’]?t\\b\\s*\\bwant\\b|\\bdo\\s*not\\b\\s*\\bwant\\b|\\banything\\b\\s*\\bbut\\b|\\bexcept\\b)\\s+(?:a\\s+)?${esc}\\b`,
    "i",
  );
  return re.test(text);
}

function detectFuelMentions(userTextNorm: string): FuelType[] {
  const hits: FuelType[] = [];

  // EV
  if (/(^|\b)(ev|electric|electric\s+vehicle|battery)(\b|$)/i.test(userTextNorm)) {
    hits.push("ev");
  }

  // CNG
  if (/(^|\b)cng(\b|$)/i.test(userTextNorm)) {
    hits.push("cng");
  }

  // Petrol (include common misspelling)
  if (/(^|\b)(petrol|petroleum|petral)(\b|$)/i.test(userTextNorm)) {
    hits.push("petrol");
  }

  // Diesel
  if (/(^|\b)diesel(\b|$)/i.test(userTextNorm)) {
    hits.push("diesel");
  }

  return uniqueStable(hits);
}

function detectModelCandidate(userTextNorm: string): DetectedModelCandidate | null {
  // Returns a model + strength for overwrite heuristics.
  // "Strong" means: a specific model pattern match (exact list or high-confidence regex).
  // This function remains deterministic and should be conservative.

  // Order matters: prefer more specific models and more conservative spans.
  const patterns: Array<{
    model: string;
    re: RegExp;
    strength: "strong" | "weak";
    reason: string;
  }> = [
    // High confidence: explicit Xpres-T tokenization including common misspellings.
    // Accept: "xpress t", "xpress-t", "xpres t", "xpres-t".
    {
      model: "xpress-t",
      re: /(^|\b)(xpress|xpres)\s*[-]?\s*t(\b|$)/i,
      strength: "strong",
      reason: "regex:xpress-t",
    },

    // Strong: exact model names.
    { model: "harrier", re: /(^|\b)harrier(\b|$)/i, strength: "strong", reason: "list:harrier" },
    { model: "nexon", re: /(^|\b)nexon(\b|$)/i, strength: "strong", reason: "list:nexon" },
    { model: "altroz", re: /(^|\b)altroz(\b|$)/i, strength: "strong", reason: "list:altroz" },
    { model: "punch", re: /(^|\b)punch(\b|$)/i, strength: "strong", reason: "list:punch" },
    { model: "tiago", re: /(^|\b)tiago(\b|$)/i, strength: "strong", reason: "list:tiago" },
    { model: "tigor", re: /(^|\b)tigor(\b|$)/i, strength: "strong", reason: "list:tigor" },
    { model: "safari", re: /(^|\b)safari(\b|$)/i, strength: "strong", reason: "list:safari" },

    // Weak: generic "xpress" without trim.
    { model: "xpress", re: /(^|\b)xpress(\b|$)/i, strength: "weak", reason: "list:xpress" },
  ];

  for (const p of patterns) {
    const m = userTextNorm.match(p.re);
    if (!m) continue;
    // Prefer the full match as a span for ambiguity checks.
    const matchedSpan = normModelValue(m[0] ?? "");
    return { model: p.model, strength: p.strength, reason: p.reason, matchedSpan };
  }

  return null;
}

function messageContainsModelToken(textNorm: string, modelNorm: string): boolean {
  // Conservative ambiguity guard: check if message includes an explicit mention of the model.
  // Model tokens are hard-coded here to stay deterministic.
  const checks: Array<{ model: string; re: RegExp }> = [
    { model: "xpress-t", re: /(^|\b)(xpress|xpres)\s*[-]?\s*t(\b|$)/i },
    { model: "xpress", re: /(^|\b)xpress(\b|$)/i },
    { model: "harrier", re: /(^|\b)harrier(\b|$)/i },
    { model: "nexon", re: /(^|\b)nexon(\b|$)/i },
    { model: "altroz", re: /(^|\b)altroz(\b|$)/i },
    { model: "punch", re: /(^|\b)punch(\b|$)/i },
    { model: "tiago", re: /(^|\b)tiago(\b|$)/i },
    { model: "tigor", re: /(^|\b)tigor(\b|$)/i },
    { model: "safari", re: /(^|\b)safari(\b|$)/i },
  ];

  const c = checks.find((x) => x.model === modelNorm);
  if (!c) return false;
  return c.re.test(textNorm);
}

function explicitCorrectionPresent(textNorm: string, _slotName: string): boolean {
  // Conservative: only treat as "explicit correction" if message contains
  // a negation/correction cue.
  // Examples:
  // - "not cng"
  // - "no, petrol"
  // - "actually petrol"
  // - "sorry petrol"
  // - "not harrier, nexon"

  // Generic correction cues
  const hasCue =
    /(^|\b)(not|no|actually|sorry|correction|i mean|rather)(\b|$)/i.test(
      textNorm,
    ) ||
    /\bchange\b\s+to\b/i.test(textNorm);

  // For now slotName is unused, but kept for future per-slot cues.
  return hasCue;
}

function shouldOverwriteSlot(params: {
  textNorm: string;
  slotKey: string;
  existingValue: unknown;
  proposedValue: unknown;
}): boolean {
  const { textNorm, existingValue, proposedValue } = params;

  // If slot not set, always allow filling.
  if (existingValue === undefined || existingValue === null || existingValue === "") {
    return true;
  }

  // Same value => no overwrite.
  if (String(existingValue) === String(proposedValue)) return false;

  // Only overwrite if the user explicitly corrects.
  // For fuel_type, also accept "not <old>" as explicit correction.
  // For model, accept "not <old>" as explicit correction.
  const oldNorm = norm(existingValue);
  if (oldNorm && hasNegationNear(textNorm, oldNorm)) return true;

  return explicitCorrectionPresent(textNorm, params.slotKey);
}

function shouldOverwriteVehicleModel(params: {
  textNorm: string;
  existingValue: unknown;
  proposed: DetectedModelCandidate;
}): { ok: boolean; reason?: string } {
  const { textNorm, existingValue, proposed } = params;

  // If slot not set, always allow filling.
  if (existingValue === undefined || existingValue === null || existingValue === "") {
    return { ok: true, reason: "empty" };
  }

  const oldNorm = normModelValue(existingValue);
  const newNorm = normModelValue(proposed.model);

  // Same value => no overwrite.
  if (oldNorm && oldNorm === newNorm) return { ok: false };

  // Ambiguity protection: do not overwrite if message contains both old and new models.
  // (e.g. "harrier xpress t")
  if (oldNorm && messageContainsModelToken(textNorm, oldNorm) && messageContainsModelToken(textNorm, newNorm)) {
    return { ok: false, reason: "ambiguous:contains-both" };
  }

  // Preserve prior behavior for weak signals: only overwrite if explicit correction.
  if (proposed.strength === "weak") {
    return {
      ok: shouldOverwriteSlot({
        textNorm,
        slotKey: "vehicle_model",
        existingValue,
        proposedValue: proposed.model,
      }),
      reason: "weak-signal:needs-explicit-correction",
    };
  }

  // Strong signal: allow overwrite when confidently detected and unambiguous.
  return { ok: true, reason: `strong-signal:${proposed.reason}` };
}

export function extractSlotsFromUserText(
  userText: string,
  existing: WorkflowSlots,
  opts?: {
    onLog?: (level: "info" | "debug" | "warn", message: string, extra?: Record<string, unknown>) => void;
  },
): { next: WorkflowSlots; changed: boolean } {
  const textNorm = norm(userText);
  const next: WorkflowSlots = { ...(existing ?? {}) };
  let changed = false;

  if (!textNorm) return { next, changed: false };

  // ----------------------
  // fuel_type
  // ----------------------
  const fuelHits = detectFuelMentions(textNorm);
  // If multiple fuels are mentioned, pick deterministically:
  // - if there is an explicit "not X, Y" correction, prefer a non-negated mention.
  // - else pick the last mention in the text (more likely to be the final choice).
  if (fuelHits.length) {
    const existingFuel = next["fuel_type"];

    // Build mention order by scanning tokens.
    const tokens = tokenize(textNorm);
    const mentionOrder: FuelType[] = [];
    for (const t of tokens) {
      const tt = norm(t);
      if (tt === "cng") mentionOrder.push("cng");
      else if (tt === "diesel") mentionOrder.push("diesel");
      else if (tt === "petrol" || tt === "petral" || tt === "petroleum")
        mentionOrder.push("petrol");
      else if (tt === "ev" || tt === "electric") mentionOrder.push("ev");
    }

    const ordered = uniqueStable(mentionOrder.filter((x) => fuelHits.includes(x)));
    const candidate = (ordered.length ? ordered[ordered.length - 1] : fuelHits[0]) as FuelType;

    if (
      shouldOverwriteSlot({
        textNorm,
        slotKey: "fuel_type",
        existingValue: existingFuel,
        proposedValue: candidate,
      })
    ) {
      changed = setIfChanged(next, "fuel_type", candidate) || changed;
    }
  }

  // ----------------------
  // vehicle_model
  // ----------------------
  const modelCandidate = detectModelCandidate(textNorm);
  if (modelCandidate) {
    const existingModel = next["vehicle_model"];

    const decision = shouldOverwriteVehicleModel({
      textNorm,
      existingValue: existingModel,
      proposed: modelCandidate,
    });

    if (decision.ok) {
      const prev = existingModel;
      const did = setIfChanged(next, "vehicle_model", modelCandidate.model);
      changed = did || changed;

      if (did && prev !== undefined && prev !== null && String(prev).trim() !== "") {
        opts?.onLog?.("info", "[workflow][slots] vehicle_model overwritten", {
          prev_model: prev,
          next_model: modelCandidate.model,
          reason: decision.reason ?? null,
        });
      }
    }
  }

  return { next, changed };
}

export function isFuelFollowupMessage(msg: string): boolean {
  const t = norm(msg);
  if (!t) return false;

  // a) must contain a fuel mention
  const fuels = detectFuelMentions(t);
  if (!fuels.length) return false;

  // b) must NOT contain strong model candidate (conservative)
  const model = detectModelCandidate(t);
  if (model?.strength === "strong") return false;

  // c) must NOT contain strong non-fuel intent tokens
  // Keep conservative: if user is asking pricing/offers/booking/service, don't treat as fuel-only.
  if (/₹|\b\d{3,}\b/.test(t)) return false;
  if (/\b(price|pricing|on\s*road|on-?road|breakup|quote|ex\s*showroom|ex-?showroom|emi|loan)\b/i.test(t)) return false;
  if (/\b(offer|discount|scheme|deal)\b/i.test(t)) return false;
  if (/\b(book|booking|test\s*drive|td|schedule|appointment|visit|delivery)\b/i.test(t)) return false;
  if (/\b(service|servicing|workshop|maintenance|repair|warranty|rsa)\b/i.test(t)) return false;

  // d) allow simple qualifiers (transmission + short trim-like tokens)
  // But reject if we see unknown/longer content.
  const tokens = tokenize(t);
  if (tokens.length > 6) return false;

  const allowed = new Set([
    // fuels
    "petrol",
    "petroleum",
    "petral",
    "diesel",
    "cng",
    "ev",
    "electric",
    "battery",
    // transmission
    "manual",
    "automatic",
    "amt",
    "dca",
    "at",
    // common short connectors
    "or",
    "and",
    "with",
    "in",
  ]);

  const isAllowedQualifierToken = (tok: string): boolean => {
    const x = norm(tok);
    if (!x) return false;
    if (allowed.has(x)) return true;

    // short variant/trim-like tokens are allowed (conservative)
    // Examples: adventure+, xz, xz+, xza, xza+, zx, xm, xt, xms, xzs
    if (/^[a-z0-9]{1,6}\+?$/.test(x)) return true;
    return false;
  };

  // If any token is not in the allowed set / qualifier pattern, do not treat as fuel follow-up.
  if (tokens.some((tok) => !isAllowedQualifierToken(tok))) return false;

  return true;
}

// Backward-compatible alias (older code/tests may still import this name)
export function isFuelOnlyFollowupMessage(msg: string): boolean {
  return isFuelFollowupMessage(msg);
}

// Export for tests.
export const __test__ = {
  detectModelCandidate,
  shouldOverwriteVehicleModel,
  messageContainsModelToken,
  normModelValue,
  isNonEmptySlotValue(v: unknown): boolean {
    if (v === null || v === undefined) return false;
    if (typeof v === "string") return v.trim().length > 0;
    return true;
  },
  mergeSlotsPreferNonEmpty(
    base: Record<string, unknown>,
    preferred: Record<string, unknown>
  ): Record<string, unknown> {
    const out: Record<string, unknown> = { ...(base ?? {}) };
    const src: Record<string, unknown> = { ...(preferred ?? {}) };

    for (const [k, v] of Object.entries(src)) {
      if (v === null || v === undefined) continue;
      if (typeof v === "string") {
        const s = v.trim();
        if (!s) continue;
        out[k] = s;
        continue;
      }
      out[k] = v;
    }

    return out;
  },
};
