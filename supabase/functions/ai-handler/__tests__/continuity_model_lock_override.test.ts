// supabase/functions/ai-handler/__tests__/continuity_model_lock_override.test.ts
import { assertEquals } from "./test_harness.ts";
import * as Slots from "../workflow/slots.ts";
import { areRequiredEntitiesPresent } from "../workflow/required_entities_mapping.ts";
import {
  detectVehicleModelFromMessage,
  normalizeVehicleModelToken,
} from "../model_normalize.ts";

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

function simulateFuelOnlyContinuityExtract(params: {
  lockedModel: string | null;
  lockedFuel?: string | null;
  userMessage: string;
}): { vehicle_model: string | null; fuel_type: string | null } {
  const { lockedModel, lockedFuel, userMessage } = params;

  const currentModel = lockedModel;
  const modelDetect = Slots.extractSlotsFromUserText(userMessage, {}, {});
  const detectedFuel =
    typeof (modelDetect?.next as Record<string, unknown>)?.fuel_type === "string"
      ? String((modelDetect.next as Record<string, unknown>).fuel_type)
      : null;

  const isFuelOnlyFollowup =
    Boolean(currentModel) && Slots.isFuelFollowupMessage(userMessage);

  if (isFuelOnlyFollowup) {
    return {
      vehicle_model: currentModel,
      fuel_type: detectedFuel ?? (lockedFuel ?? null),
    };
  }

  // If no locked model, do not infer model from fuel.
  return {
    vehicle_model: currentModel,
    fuel_type: detectedFuel ?? (lockedFuel ?? null),
  };
}

Deno.test("continuity: locked=Harrier, msg='xpress t' => bypass lock; model becomes xpres-t", () => {
  const next = simulateContinuityNextModel({ lockedModel: "Harrier", userMessage: "xpress t" });
  assertEquals(next, "xpres-t");
});

Deno.test("continuity: locked=Harrier, msg='harrier xpress t' => ambiguous; keep Harrier", () => {
  const next = simulateContinuityNextModel({ lockedModel: "Harrier", userMessage: "harrier xpress t" });
  assertEquals(next, "Harrier");
});

Deno.test("continuity: locked=Harrier, msg='ok' => keep Harrier", () => {
  const next = simulateContinuityNextModel({ lockedModel: "Harrier", userMessage: "ok" });
  assertEquals(next, "Harrier");
});

Deno.test("fuel-only follow-up: locked=Nexon + msg='cng' => model stays Nexon; fuel=cng", () => {
  const res = simulateFuelOnlyContinuityExtract({
    lockedModel: "Nexon",
    lockedFuel: null,
    userMessage: "cng",
  });
  assertEquals(res.vehicle_model, "Nexon");
  assertEquals(res.fuel_type, "cng");
});

Deno.test("fuel-only follow-up: locked=Nexon + msg='diesel' => model stays Nexon; fuel=diesel", () => {
  const res = simulateFuelOnlyContinuityExtract({
    lockedModel: "Nexon",
    lockedFuel: null,
    userMessage: "diesel",
  });
  assertEquals(res.vehicle_model, "Nexon");
  assertEquals(res.fuel_type, "diesel");
});

Deno.test("fuel-only follow-up: locked=Nexon + msg='curvv' => is NOT fuel-only (existing behavior switch allowed)", () => {
  const isFuelOnly = Slots.isFuelFollowupMessage("curvv");
  assertEquals(isFuelOnly, false);
});

Deno.test("fuel follow-up: locked=Nexon + msg='diesel automatic' => model stays Nexon; fuel=diesel", () => {
  const res = simulateFuelOnlyContinuityExtract({
    lockedModel: "Nexon",
    lockedFuel: null,
    userMessage: "diesel automatic",
  });
  assertEquals(res.vehicle_model, "Nexon");
  assertEquals(res.fuel_type, "diesel");
});

Deno.test("fuel follow-up: locked=Nexon + msg='petrol adventure+' => model stays Nexon; fuel=petrol", () => {
  const res = simulateFuelOnlyContinuityExtract({
    lockedModel: "Nexon",
    lockedFuel: null,
    userMessage: "petrol adventure+",
  });
  assertEquals(res.vehicle_model, "Nexon");
  assertEquals(res.fuel_type, "petrol");
});

Deno.test("fuel follow-up disqualifier: msg='diesel price' => NOT fuel-followup", () => {
  const isFuelOnly = Slots.isFuelFollowupMessage("diesel price");
  assertEquals(isFuelOnly, false);
});

Deno.test("fuel-only follow-up: no locked model + msg='cng' => vehicle_model remains null (no inference)", () => {
  const res = simulateFuelOnlyContinuityExtract({
    lockedModel: null,
    lockedFuel: null,
    userMessage: "cng",
  });
  assertEquals(res.vehicle_model, null);
  assertEquals(res.fuel_type, "cng");
});

Deno.test("workflow auto-skip mapping: required_entities=['vehicle_model'] is NOT satisfied by slots{fuel_type:'cng'}", () => {
  const required = ["vehicle_model"]; 
  const slots: Record<string, unknown> = { fuel_type: "cng" };
  const ok = areRequiredEntitiesPresent(required, slots);
  assertEquals(ok, false);
});

Deno.test("continuity: locked=Harrier, msg='info on xpres t' => model becomes xpres-t; next msg='pricing' stays xpres-t", () => {
  const first = simulateContinuityNextModel({
    lockedModel: "Harrier",
    userMessage: "info on xpres t",
  });
  assertEquals(first, "xpres-t");

  const second = simulateContinuityNextModel({
    lockedModel: String(first),
    userMessage: "pricing",
  });
  assertEquals(second, "xpres-t");
});

Deno.test("continuity+normalize: locked=Harrier, msg='send xpres t ev brochure' => canonical xpres-t-ev; next msg='interior photo' stays xpres-t-ev", () => {
  // First turn: continuity harness uses slots.ts which now yields xpres-t (base)
  const first = simulateContinuityNextModel({
    lockedModel: "Harrier",
    userMessage: "send xpres t ev brochure",
  });
  assertEquals(first, "xpres-t");

  // Main handler additionally applies model_normalize, which promotes EV.
  const detected = detectVehicleModelFromMessage("send xpres t ev brochure");
  assertEquals(detected, "xpres-t-ev");

  const persisted = normalizeVehicleModelToken(detected);
  assertEquals(persisted, "xpres-t-ev");

  // Next turn should keep the EV model when no new model is mentioned.
  const second = simulateContinuityNextModel({
    lockedModel: String(persisted),
    userMessage: "interior photo",
  });
  assertEquals(second, "xpres-t-ev");
});
