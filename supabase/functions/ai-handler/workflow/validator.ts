// supabase/functions/ai-handler/workflow/validator.ts
// Hard validation + repair for outbound AI text.

export type Intent = "pricing" | "offer" | "features" | "service" | "other";

export type ValidationContext = {
  intent: Intent;
  verifiedNumbersAvailable: boolean;
  allowedNumbers: Set<string>;
  workflowSayMessage?: string;
};

export type ValidationResult = {
  ok: boolean;
  text: string;
  violations: string[];
  used_fallback: boolean;
};

function countQuestionMarks(text: string): number {
  return (text.match(/\?/g) || []).length;
}

function normalizeNumberToken(raw: string): string {
  // Normalize: "Rs 5,00,000" -> "₹5,00,000"
  return raw
    .replace(/\s+/g, "")
    .replace(/^Rs\.?/i, "₹")
    .replace(/^INR/i, "₹");
}

export function extractNumberTokens(text: string): Set<string> {
  const s = new Set<string>();
  const re =
    /(?:₹\s*)?\d{1,3}(?:,\d{3})*(?:\.\d+)?|\b\d+(?:\.\d+)?\b/g;
  const matches = text.match(re) || [];
  for (const m of matches) {
    const t = normalizeNumberToken(m);
    if (t) s.add(t);
  }
  return s;
}

export function validateAndRepairResponse(
  inputText: string,
  ctx: ValidationContext
): ValidationResult {
  let text = (inputText || "").trim();
  const violations: string[] = [];

  // 1) Forbidden phrasing
  if (/contact (the )?dealer|contact dealership|dealer\.?ship/i.test(text)) {
    violations.push("forbidden_phrase_contact_dealer");
    text = text.replace(/contact (the )?dealer(ship)?/gi, "contact Techwheels");
  }

  // 2) Enforce max 1 question
  const qCount = countQuestionMarks(text);
  if (qCount > 1) {
    violations.push("too_many_questions");
    const idx = text.indexOf("?");
    if (idx >= 0) text = text.slice(0, idx + 1).trim();
  }

  // 3) Strict pricing/offer gating: if no verified numbers, block any digits/₹
  if ((ctx.intent === "pricing" || ctx.intent === "offer") && !ctx.verifiedNumbersAvailable) {
    if (/[₹\d]/.test(text)) {
      violations.push("numbers_without_verification");
      const fallback =
        "Sure — kaunsi exact variant chahiye (fuel + transmission)? Techwheels team aapko exact on-road confirm kar degi.";
      return { ok: false, text: fallback, violations, used_fallback: true };
    }
  }

  // 4) If verified numbers exist, ensure no invented numbers (best-effort)
  if ((ctx.intent === "pricing" || ctx.intent === "offer") && ctx.verifiedNumbersAvailable) {
    const found = extractNumberTokens(text);
    for (const n of found) {
      if (!ctx.allowedNumbers.has(n)) {
        violations.push("unverified_number_in_output");
        const fallback =
          "Main aapko Techwheels se latest verified pricing/offer confirm karke share kar raha/rahi hoon. Kaunsi exact variant (fuel + transmission) ke liye chahiye?";
        return { ok: false, text: fallback, violations, used_fallback: true };
      }
    }
  }

  // 5) Workflow SAY fallback: if response ends up empty, use directive message
  if (ctx.workflowSayMessage && ctx.workflowSayMessage.trim()) {
    if (text.length < 5) {
      violations.push("empty_or_too_short");
      return {
        ok: false,
        text: ctx.workflowSayMessage.trim(),
        violations,
        used_fallback: true,
      };
    }
  }

  return { ok: violations.length === 0, text, violations, used_fallback: false };
}
