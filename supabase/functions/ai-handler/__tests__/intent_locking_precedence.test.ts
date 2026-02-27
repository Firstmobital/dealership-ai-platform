// supabase/functions/ai-handler/__tests__/intent_locking_precedence.test.ts
import { assertEquals } from "./test_harness.ts";
import { inferIntentHeuristic } from "../intent_heuristics.ts";

type Intent = "pricing" | "offer" | "other";

function applyContinuityIntentPrecedence(params: {
  lockedIntent: Intent;
  userMessage: string;
}): Intent {
  let intent: Intent = params.lockedIntent;
  const msg = params.userMessage;
  const heuristic = inferIntentHeuristic(msg);

  // Mirrors main_handler.ts precedence:
  // 1) offer->pricing allowed when explicit pricing/breakup signals appear
  const wantsPricingSwitchFromOffer =
    intent === "offer" &&
    (heuristic.intent === "pricing" ||
      /\b(on\s*road|on-?road|breakup|price|pricing|quote|ex\s*showroom|ex-?showroom)\b/i.test(
        msg
      ));
  if (wantsPricingSwitchFromOffer) intent = "pricing";

  // 2) pricing->offer always when offer signals exist
  if (heuristic.intent === "offer" && intent !== "offer") intent = "offer";

  return intent;
}

Deno.test("intent precedence: locked=pricing + 'any discount?' => becomes offer", () => {
  const next = applyContinuityIntentPrecedence({
    lockedIntent: "pricing",
    userMessage: "any discount?",
  });
  assertEquals(next, "offer");
});

Deno.test("intent precedence: locked=offer + 'on-road breakup?' => becomes pricing", () => {
  // Explicit behavior choice: allow offer -> pricing for explicit breakup/quote questions.
  const next = applyContinuityIntentPrecedence({
    lockedIntent: "offer",
    userMessage: "on-road breakup?",
  });
  assertEquals(next, "pricing");
});
