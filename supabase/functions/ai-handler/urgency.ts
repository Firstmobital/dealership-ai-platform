/* ============================================================================
   DETERMINISTIC URGENCY DETECTION
============================================================================ */
export type Urgency = "high" | "medium" | "low";

export function detectUrgency(text: string): Urgency {
  const t = (text || "").toLowerCase();

  // High urgency: price/availability/booking/immediacy intent
  const highKeywords = [
    "price",
    "on-road",
    "on road",
    "discount",
    "offer",
    "available",
    "availability",
    "stock",
    "booking",
    "book",
    "slot",
    "today",
    "tomorrow",
    "test drive",
    "testdrive",
    "deliver",
    "delivery",
    "emi",
    "down payment",
    "downpayment",
    "quote",
    "final",
  ];

  // Medium urgency: comparison / variant / spec intent
  const mediumKeywords = [
    "compare",
    "comparison",
    "difference",
    "vs",
    "variant",
    "model",
    "features",
    "feature",
    "mileage",
    "range",
    "engine",
    "battery",
    "colour",
    "color",
    "spec",
    "specs",
    "safety",
    "airbag",
    "sunroof",
    "automatic",
    "manual",
  ];

  const greetingOnly = /^\s*(hi|hello|hey|good\s*(morning|afternoon|evening)|thanks|thank\s*you|ok|okay|cool)\s*[!.]*\s*$/i;

  // Strong transactional patterns
  const hasMoneyOrTime =
    /\b(₹|rs\.?|inr|price|cost|on\s*-?road|otr|discount|offer|deal|quote)\b/i.test(t) ||
    /\b(today|tomorrow|now|urgent|asap)\b/i.test(t);
  const hasBooking = /\b(book|booking|reserve|slot|appointment|test\s*drive)\b/i.test(t);
  const hasAvailability = /\b(available|availability|in\s*stock|stock)\b/i.test(t);

  if (hasMoneyOrTime || hasBooking || hasAvailability) return "high";
  if (highKeywords.some((k) => t.includes(k))) return "high";

  const hasComparison = /\b(vs\b|compare|difference|better|which\s+one|variant|model)\b/i.test(t);
  if (hasComparison) return "medium";
  if (mediumKeywords.some((k) => t.includes(k))) return "medium";

  if (greetingOnly.test(text || "")) return "low";

  // Default: if it's not obviously transactional, treat as medium if it asks anything specific
  const hasQuestionOrSpecific = /\?|\b(tell\s+me|info|details|explain|spec|features)\b/i.test(t);
  return hasQuestionOrSpecific ? "medium" : "low";
}

export function enforceHighUrgencyReply(reply: string): string {
  const trimmed = (reply || "").trim();
  if (!trimmed) return trimmed;

  // Ensure at most one question.
  const qCount = (trimmed.match(/\?/g) || []).length;
  let out = trimmed;
  if (qCount > 1) {
    // Keep first question mark; replace subsequent question marks with periods.
    let seen = 0;
    out = out.replace(/\?/g, (m) => {
      seen += 1;
      return seen === 1 ? m : ".";
    });
  }

  // Ensure a clear next step exists.
  const hasNextStep =
    /\b(next\s*step|i can|we can|let\s*me|shall\s*i|please\s*(share|send)|book|schedule|confirm|connect|call|visit|test\s*drive|quote)\b/i.test(
      out.toLowerCase(),
    );

  if (!hasNextStep) {
    // Add a deterministic, low-risk CTA without adding a second question.
    out +=
      "\n\nNext step: Share your preferred variant and city, and I’ll confirm the latest on-road price and availability.";
  }

  return out;
}

