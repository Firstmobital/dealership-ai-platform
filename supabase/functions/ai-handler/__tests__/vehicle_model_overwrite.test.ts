// supabase/functions/ai-handler/__tests__/vehicle_model_overwrite.test.ts
import { assertEquals } from "./test_harness.ts";
import { extractSlotsFromUserText } from "../workflow/slots.ts";

Deno.test("vehicle_model overwrites on strong new model detection (prev=harrier, msg=xpress t)", () => {
  const prev = { vehicle_model: "Harrier" };
  const res = extractSlotsFromUserText("xpress t", prev);
  assertEquals(res.next.vehicle_model, "xpress-t");
  assertEquals(res.changed, true);
});

Deno.test("vehicle_model does NOT overwrite when message contains both models (ambiguous)", () => {
  const prev = { vehicle_model: "Harrier" };
  const res = extractSlotsFromUserText("harrier xpress t", prev);
  assertEquals(res.next.vehicle_model, "Harrier");
  assertEquals(res.changed, false);
});

Deno.test("vehicle_model does NOT overwrite on no model signal", () => {
  const prev = { vehicle_model: "Harrier" };
  const res = extractSlotsFromUserText("ok", prev);
  assertEquals(res.next.vehicle_model, "Harrier");
  assertEquals(res.changed, false);
});
