// supabase/functions/ai-handler/workflow/slots.ts
// Deterministic slot extraction for workflow state.
// - No external dependencies.
// - Regex + keyword matching only.
// - Stable, simple return shape.

export type WorkflowSlots = Record<string, unknown>;

type FuelType = "petrol" | "diesel" | "cng" | "ev";

function norm(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
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

function detectModel(userTextNorm: string): string | null {
  // Basic keyword mapping. Keep values stable and normalized.
  // Add synonyms/variants only via deterministic patterns.
  const patterns: Array<{ model: string; re: RegExp }> = [
    // Tata (examples in prompt)
    { model: "xpress", re: /(^|\b)xpress(\b|$)/i },
    // treat xpress-t as a distinct model key
    { model: "xpress-t", re: /(^|\b)xpress\s*[-]?\s*t(\b|$)/i },

    { model: "harrier", re: /(^|\b)harrier(\b|$)/i },
    { model: "nexon", re: /(^|\b)nexon(\b|$)/i },
    { model: "altroz", re: /(^|\b)altroz(\b|$)/i },

    // A few common add-ons (safe; can be extended later)
    { model: "punch", re: /(^|\b)punch(\b|$)/i },
    { model: "tiago", re: /(^|\b)tiago(\b|$)/i },
    { model: "tigor", re: /(^|\b)tigor(\b|$)/i },
    { model: "safari", re: /(^|\b)safari(\b|$)/i },
  ];

  // Prefer the most specific match (xpress-t before xpress)
  for (const p of patterns) {
    if (p.re.test(userTextNorm)) return p.model;
  }
  return null;
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

export function extractSlotsFromUserText(
  userText: string,
  existing: WorkflowSlots,
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
  const model = detectModel(textNorm);
  if (model) {
    const existingModel = next["vehicle_model"];
    if (
      shouldOverwriteSlot({
        textNorm,
        slotKey: "vehicle_model",
        existingValue: existingModel,
        proposedValue: model,
      })
    ) {
      changed = setIfChanged(next, "vehicle_model", model) || changed;
    }
  }

  return { next, changed };
}
