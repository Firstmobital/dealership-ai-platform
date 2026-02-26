/* ============================================================================
   INTENT HEURISTICS (FAILSAFE)
============================================================================ */
// Lightweight keyword heuristics used ONLY when AI extraction is missing/weak.
// This prevents "intent: other" from breaking pricing/offer flows.
export function inferIntentHeuristic(userMessage: string): {
  intent: "pricing" | "offer" | "features" | "service" | "other";
  signals: string[];
} {
  const msg = (userMessage || "").toLowerCase();
  const signals: string[] = [];

  const hasAny = (arr: string[]) => arr.some((k) => msg.includes(k));

  const pricingKeys = [
    "price",
    "pricing",
    "prize",
    "onroad",
    "exshowroom",
    "on road",
    "on-road",
    "ex showroom",
    "ex-showroom",
    "emi",
    "down payment",
    "dp",
    "insurance",
    "rto",
    "registration",
    "tcs",
    "quotation",
    "quote",
    "breakup",
    "cost",
    // Hindi / Hinglish
    "कीमत",
    "क़ीमत",
    "दाम",
    "प्राइस",
    "price kya",
    "price kya hai",
    "on road price",
    "ऑन रोड",
    "ऑन-रोड",
    "एक्स शोरूम",
    "एक्स-शोरूम",
  ];
  const offerKeys = [
    "discount",
    "offer",
    "deal",
    "scheme",
    "exchange bonus",
    "exchange",
    "corporate",
    "loyalty",
    // Hindi / Hinglish
    "डिस्काउंट",
    "ऑफर",
    "स्कीम",
    "scheme kya",
    "koi offer",
    "best offer",
  ];
  const featuresKeys = [
    "feature",
    "features",
    "spec",
    "specs",
    "mileage",
    "range",
    "bhp",
    "torque",
    "safety",
    "sunroof",
    "variants",
  ];
  const serviceKeys = [
    "service",
    "servicing",
    "maintenance",
    "workshop",
    "pickup",
    "drop",
    "appointment",
    "schedule",
    "cost of service",
  ];

  if (hasAny(pricingKeys)) signals.push("pricing_keywords");
  if (hasAny(offerKeys)) signals.push("offer_keywords");
  if (hasAny(featuresKeys)) signals.push("features_keywords");
  if (hasAny(serviceKeys)) signals.push("service_keywords");

  // Precedence: offer > pricing (when both present, assume offer question)
  if (hasAny(offerKeys)) return { intent: "offer", signals };
  if (hasAny(pricingKeys)) return { intent: "pricing", signals };
  if (hasAny(featuresKeys)) return { intent: "features", signals };
  if (hasAny(serviceKeys)) return { intent: "service", signals };

  return { intent: "other", signals };
}

/* ============================================================================
   CONVERSATION INTENT + FUNNEL STAGE (DETERMINISTIC FIRST)
   - Locks high-level intent: sales vs service (plus finance/accessories/general)
   - Produces a funnel stage for better continuity
   - LLM is allowed only as a LOW-CONFIDENCE fallback elsewhere
============================================================================ */
type DeterministicIntentResult = {
  high_level_intent:
    | "sales"
    | "service"
    | "finance"
    | "accessories"
    | "general";
  stage: "awareness" | "consideration" | "decision" | "post_purchase";
  confidence: number;
  reasons: string[];
};

/* ==========================================================================
   PRIMARY INTENT (DEALERSHIP WORKFLOWS) — DETERMINISTIC
   - MUST NOT add new LLM calls
   - Derived from existing extracted intent (pricing/offer/features/service/other)
     + existing keyword heuristics already present in this file.
   - Stored in conversations.ai_state.primary_intent
   - Also sets conversations.intent (legacy bucket) for backward compatibility
============================================================================ */
export type PrimaryIntent =
  | "sales_new_car"
  | "sales_variant_pricing"
  | "sales_offer_stock"
  | "service_booking"
  | "service_status"
  | "service_complaint"
  | "general_inquiry"
  | "off_topic";

export function classifyPrimaryIntent(params: {
  userMessage: string;
  extractedIntent: "pricing" | "offer" | "features" | "service" | "other";
  intentBucket: "sales" | "service" | "finance" | "accessories";
}): {
  primary_intent: PrimaryIntent;
  legacy_bucket: "sales" | "service" | "general";
} {
  const msg = (params.userMessage || "").toLowerCase();
  const extracted = params.extractedIntent || "other";

  // Conservative off-topic detector (do not steal legitimate car/service queries)
  const isOffTopic =
    /\b(weather|cricket|movie|movies|song|music|joke|meme|politics|election|bitcoin|crypto|stock market)\b/i.test(
      msg
    ) &&
    !/\b(car|vehicle|test drive|price|pricing|variant|discount|offer|service|workshop|booking|appointment)\b/i.test(
      msg
    );
  if (isOffTopic) {
    return { primary_intent: "off_topic", legacy_bucket: "general" };
  }

  // Service split (mirrors existing detectServiceTicketType patterns)
  if (params.intentBucket === "service" || extracted === "service") {
    if (/(book|booking|appointment|slot|schedule|pickup|drop)/i.test(msg)) {
      return { primary_intent: "service_booking", legacy_bucket: "service" };
    }
    if (/(status|job card|jobcard|ready|done|completed)/i.test(msg)) {
      return { primary_intent: "service_status", legacy_bucket: "service" };
    }
    if (
      /(complaint|issue|problem|noise|vibration|not working|failed|refund|consumer|court)/i.test(
        msg
      )
    ) {
      return { primary_intent: "service_complaint", legacy_bucket: "service" };
    }
    // If still service but subtype unclear, default safely
    return { primary_intent: "general_inquiry", legacy_bucket: "service" };
  }

  // Sales offers: extracted offer OR strong offer keywords
  if (
    extracted === "offer" ||
    /\b(discount|offer|scheme|deal|exchange bonus|exchange|corporate|loyalty|stock offer|stock offers)\b/i.test(
      msg
    )
  ) {
    return { primary_intent: "sales_offer_stock", legacy_bucket: "sales" };
  }

  // Sales pricing: extracted pricing OR strong pricing keywords
  if (
    extracted === "pricing" ||
    /\b(price|pricing|on[- ]?road|ex[- ]?showroom|quotation|quote|emi|down payment|dp|insurance|rto|registration|tcs|breakup|cost)\b/i.test(
      msg
    )
  ) {
    return { primary_intent: "sales_variant_pricing", legacy_bucket: "sales" };
  }

  // New-car sales exploration: variants/features/test-drive, etc.
  if (
    extracted === "features" ||
    /\b(variant|variants|feature|features|spec|specs|mileage|range|bhp|torque|safety|sunroof|brochure|compare|test drive|booking|book)\b/i.test(
      msg
    )
  ) {
    return { primary_intent: "sales_new_car", legacy_bucket: "sales" };
  }

  // If the handler already decided it's sales, keep it as sales_new_car.
  if (params.intentBucket === "sales") {
    return { primary_intent: "sales_new_car", legacy_bucket: "sales" };
  }

  // Default: general inquiry
  return { primary_intent: "general_inquiry", legacy_bucket: "general" };
}

function _classifyDeterministicConversationIntent(params: {
  userMessage: string;
  lockedIntent?: string | null;
}): DeterministicIntentResult {
  const msg = (params.userMessage || "").toLowerCase();
  const reasons: string[] = [];

  const hasAny = (arr: string[]) => arr.some((k) => msg.includes(k));

  const serviceKeys = [
    "service",
    "servicing",
    "maintenance",
    "workshop",
    "pickup",
    "drop",
    "appointment",
    "schedule",
    "schedule service",
    "service booking",
    "service due",
    "oil",
    "engine oil",
    "brake",
    "clutch",
    "battery",
    "tyre",
    "tire",
    "ac",
    "aircon",
    "noise",
    "issue",
    "problem",
    "check",
    "diagnose",
    "warranty",
    "claim",
    "insurance claim",
    "accident",
    "repair",
    "estimate",
    "job card",
    "invoice",
    "bill",
    "RSA",
    "roadside",
    "सर्विस",
    "मेंटेनेंस",
    "वर्कशॉप",
    "अपॉइंटमेंट",
    "रिपेयर",
    "समस्या",
    "वारंटी",
  ];

  const financeKeys = [
    "emi",
    "loan",
    "finance",
    "down payment",
    "dp",
    "interest",
    "tenure",
    "bank",
    "approval",
    "quotation",
    "quote",
    "on-road",
    "on road",
    "ex-showroom",
    "ex showroom",
    "ईएमआई",
    "लोन",
    "फाइनेंस",
    "डाउन पेमेंट",
    "बैंक",
  ];

  const accessoriesKeys = [
    "accessory",
    "accessories",
    "mats",
    "seat cover",
    "seat covers",
    "dashcam",
    "music system",
    "alloy",
    "alloys",
    "fog lamp",
    "spoiler",
    "wrap",
    "coating",
    "ppf",
    "ceramic",
    "एक्सेसरी",
    "मैट",
    "सीट कवर",
  ];

  const salesKeys = [
    "price",
    "pricing",
    "discount",
    "offer",
    "deal",
    "scheme",
    "variant",
    "variants",
    "features",
    "brochure",
    "test drive",
    "book",
    "booking",
    "delivery",
    "waiting",
    "availability",
    "color",
    "colour",
    "mileage",
    "range",
    "top speed",
    "safety",
    "कीमत",
    "दाम",
    "ऑफर",
    "डिस्काउंट",
    "बुक",
    "टेस्ट ड्राइव",
    "वेरिएंट",
  ];

  const isService = hasAny(serviceKeys);
  const isFinance = hasAny(financeKeys);
  const isAccessories = hasAny(accessoriesKeys);
  const isSales = hasAny(salesKeys);

  let high: DeterministicIntentResult["high_level_intent"] = "general";
  let confidence = 0.5;

  // Priority: explicit service > finance > accessories > sales > general
  if (isService) {
    high = "service";
    confidence = 0.9;
    reasons.push("service_keywords");
  } else if (isFinance) {
    high = "finance";
    confidence = 0.85;
    reasons.push("finance_keywords");
  } else if (isAccessories) {
    high = "accessories";
    confidence = 0.85;
    reasons.push("accessories_keywords");
  } else if (isSales) {
    high = "sales";
    confidence = 0.75;
    reasons.push("sales_keywords");
  }

  // Stage: simple heuristic
  let stage: DeterministicIntentResult["stage"] = "consideration";
  if (
    /b(hi|hello|hey|namaste|info|details|brochure|variants|features|mileage|range)b/i.test(
      msg
    )
  ) {
    stage = "awareness";
  }
  if (
    /b(price|ons*-?road|quotation|quote|discount|offer|tests*drive|visit)b/i.test(
      msg
    )
  ) {
    stage = "consideration";
  }
  if (
    /b(book|booking|confirm|final|buy|purchase|deliver|delivery|ready|pay)b/i.test(
      msg
    )
  ) {
    stage = "decision";
  }
  if (
    high === "service" &&
    /b(done|completed|status|when|pickup|drop|bill|invoice)b/i.test(msg)
  ) {
    stage = "post_purchase";
  }

  // If the conversation already has a locked high-level intent, don't flip easily
  const locked = (params.lockedIntent || "").toLowerCase();
  if (locked && locked !== high && confidence < 0.9) {
    reasons.push("locked_intent_preferred");
    confidence = Math.min(confidence, 0.65);
  }

  return { high_level_intent: high, stage, confidence, reasons };
}

