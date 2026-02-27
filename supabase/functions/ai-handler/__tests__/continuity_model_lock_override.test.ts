// supabase/functions/ai-handler/__tests__/continuity_model_lock_override.test.ts
import { assertEquals } from "./test_harness.ts";
import * as Slots from "../workflow/slots.ts";

function mergeModelOnly(locked: { model?: unknown }, patch: { model?: unknown }): { model?: unknown } {
  // Minimal deterministic merge for tests: if patch.model is non-empty string, use it; else keep locked.model.
  const next: { model?: unknown } = { ...(locked ?? {}) };
  const v = patch?.model;
  if (typeof v === "string" && v.trim()) next.model = v;
  return next;
}

function simulateContinuityNextModel(params: {
  lockedModel: string;
  userMessage: string;
}): string | null {
  const { lockedModel, userMessage } = params;

  const locked: Record<string, unknown> = { model: lockedModel };

  // mirror main_handler logic: detect strong model in current message
  const modelDetect = Slots.extractSlotsFromUserText(userMessage, {}, {});
  const detectedModel =
    typeof modelDetect?.next?.vehicle_model === "string"
      ? String(modelDetect.next.vehicle_model).trim()
      : null;

  const lockedModelNorm = lockedModel.toLowerCase().trim();
  const detectedModelNorm = detectedModel ? detectedModel.toLowerCase().trim() : "";
  const hasStrongDifferentModel =
    Boolean(lockedModelNorm) && Boolean(detectedModelNorm) && lockedModelNorm !== detectedModelNorm;

  // ambiguity protection (contains both tokens => keep lock)
  const textNorm = userMessage.toLowerCase();
  // @ts-ignore - __test__ is exported for deterministic internals
  const contains = (m: string) => Slots.__test__.messageContainsModelToken(textNorm, m);
  const ambiguous = hasStrongDifferentModel && contains(lockedModelNorm) && contains(detectedModelNorm);

  const nextModel = (!hasStrongDifferentModel || ambiguous) ? lockedModel : detectedModel;

  const nextEntities = mergeModelOnly(locked, {
    model: nextModel ?? undefined,
  });

  return typeof nextEntities?.model === "string" ? String(nextEntities.model) : null;
}

Deno.test("continuity: locked=Harrier, msg='xpress t' => bypass lock; model becomes xpress-t", () => {
  const next = simulateContinuityNextModel({ lockedModel: "Harrier", userMessage: "xpress t" });
  assertEquals(next, "xpress-t");
});

Deno.test("continuity: locked=Harrier, msg='harrier xpress t' => ambiguous; keep Harrier", () => {
  const next = simulateContinuityNextModel({ lockedModel: "Harrier", userMessage: "harrier xpress t" });
  assertEquals(next, "Harrier");
});

Deno.test("continuity: locked=Harrier, msg='ok' => keep Harrier", () => {
  const next = simulateContinuityNextModel({ lockedModel: "Harrier", userMessage: "ok" });
  assertEquals(next, "Harrier");
});
