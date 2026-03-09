// filepath: /Users/air/dealership-ai-platform/supabase/functions/ai-handler/policies/conversation.ts
export function isGreetingMessage(input: string): boolean {
  const t = (input || "").trim().toLowerCase();

  const greetings = new Set([
    "hi",
    "hey",
    "hello",
    "hii",
    "heyy",
    "hlo",
    "helo",
    "yo",
    "namaste",
    "namaskar",
    "good morning",
    "good afternoon",
    "good evening",
    "gm",
    "ga",
    "ge",
  ]);

  if (greetings.has(t)) return true;
  if (t.startsWith("hi ")) return true;
  if (t.startsWith("hey ")) return true;
  if (t.startsWith("hello ")) return true;
  if (t.startsWith("namaste ")) return true;
  if (t.startsWith("good morning")) return true;
  if (t.startsWith("good afternoon")) return true;
  if (t.startsWith("good evening")) return true;

  return false;
}

export function isShortFollowupMessage(msg: string): boolean {
  const t = (msg || "").trim().toLowerCase();
  if (!t) return false;
  // Keep conservative: only short generic follow-ups
  const phrases = [
    "tell me more",
    "more",
    "details",
    "detail",
    "ok",
    "okay",
    "yes",
    "y",
    "haan",
    "ha",
    "sure",
    "continue",
    "next",
    "k",
    "pls",
    "please",
  ];
  if (phrases.includes(t)) return true;
  if (t.length <= 12 && /^[a-z\s]+$/.test(t)) return true;
  return false;
}

export function _looksLikeVariantOrTrimOnlyMessage(msg: string): boolean {
  const t = (msg || "").trim().toLowerCase();
  if (!t) return false;

  // Keep small + conservative: only blocks topic-change when user likely mentions a trim/gearbox/fuel only.
  // Important: this does NOT select a model; it only prevents false topic-change.
  return (
    /\b(variant|trim)\b/.test(t) ||
    /\b(adventure\+?|creative\+?|fearless|pure|smart|accomplished)\b/.test(t) ||
    /\b(manual|automatic|amt|dca)\b/.test(t) ||
    /\b(petrol|diesel|cng|ev)\b/.test(t)
  );
}

export function isExplicitTopicChange(params: {
  msg: string;
  currentModel: string | null;
  nextModelCandidate: string | null;
}): boolean {
  const t = (params.msg || "").toLowerCase();

  const currentModelNorm = (params.currentModel || "").trim().toLowerCase();
  const nextModelNorm = (params.nextModelCandidate || "").trim().toLowerCase();

  // P1-A: Mentioning a NEW model is an explicit topic change, but only when a model is already active.
  if (currentModelNorm && nextModelNorm && currentModelNorm !== nextModelNorm) return true;

  // P1-A: Variant/trim-only messages must NOT trigger explicit topic change.
  // (This only affects topic-change detection; it does not force model selection.)
  if (!nextModelNorm && _looksLikeVariantOrTrimOnlyMessage(params.msg)) return false;

  // Explicit switches only. If present, do NOT force continuity.
  // IMPORTANT: do NOT treat the literal words "model" or "variant" as a topic change by themselves.
  const patterns = [
    /\bharrier\b/,
    /\bnexon\b/,
    /\bsafari\b/,
    /\btiago\b/,
    /\btigor\b/,
    /\baltroz\b/,
    /\bpunch\b/,
    /\bcurvv\b/,
    /\bservice\b/,
    /\bbooking\b/,
    /\btest drive\b/,
  ];
  return patterns.some((p) => p.test(t));
}
