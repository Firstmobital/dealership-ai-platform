/* ============================================================================
   RESPONSE SCHEMA ENFORCER (Behavior-level)
   - Ensures dealership-executive style
   - Ensures ONLY ONE question
============================================================================ */
export function enforceDealershipReplySchema(params: {
  text: string;
  intentBucket: string; // sales | service | finance | accessories
  extractedIntent: string;
  known_model?: string | null;
  known_variant?: string | null;
  known_transmission?: string | null;
}): string {
  let t = (params.text || "").trim();
  if (!t) return t;

  // Normalize whitespace
  t = t.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ");

  // If multiple questions, keep first question mark; convert others to periods.
  const qmPositions: number[] = [];
  for (let i = 0; i < t.length; i++) if (t[i] === "?") qmPositions.push(i);
  if (qmPositions.length > 1) {
    const first = qmPositions[0];
    const before = t.slice(0, first + 1);
    const after = t.slice(first + 1).replace(/\?/g, ".");
    t = (before + after).trim();
  }

  // Ensure there's a clear next step if the message has no question.
  const looksLikeQuestionWithoutQm =
    /(^|\n)\s*(which|what|share|send)\b/i.test(t) || /\bplease share\b/i.test(t);
  const hasQuestion =
    /\?\s*$/.test(t) || t.includes("?") || looksLikeQuestionWithoutQm;
  if (!hasQuestion) {
    if (params.intentBucket === "service") {
      t +=
        "\n\nPlease share your vehicle number and preferred slot (date/time).";
    } else if (params.intentBucket === "finance") {
      t +=
        "\n\nWhich model and variant are you checking, and is it self or company purchase?";
    } else if (params.intentBucket === "accessories") {
      t +=
        "\n\nWhich model/variant is your car, and which accessory are you looking for?";
    } else {
      // sales
      if (
        params.extractedIntent === "pricing" ||
        params.extractedIntent === "offer"
      ) {
        const hasKnownModel = Boolean((params.known_model || "").trim());
        const hasKnownVariant = Boolean((params.known_variant || "").trim());
        const hasKnownTransmission = Boolean(
          (params.known_transmission || "").trim()
        );

        // Only ask for model/variant/transmission when they are not already known.
        // Ask ONLY the highest-priority missing slot (one short question).
        if (!hasKnownModel) {
          t += "\n\nWhich model are you checking?";
        } else if (!hasKnownVariant) {
          t += "\n\nWhich variant are you checking?";
        } else if (!hasKnownTransmission) {
          t += "\n\nManual or automatic transmission?";
        }
      } else {
        t += "\n\nWhich model are you considering?";
      }

      // Re-run one-question enforcement after appending.
      const qm2: number[] = [];
      for (let i = 0; i < t.length; i++) if (t[i] === "?") qm2.push(i);
      if (qm2.length > 1) {
        const first = qm2[0];
        const before = t.slice(0, first + 1);
        const after = t.slice(first + 1).replace(/\?/g, ".");
        t = (before + after).trim();
      }
    }
  }

  return t.trim();
}

