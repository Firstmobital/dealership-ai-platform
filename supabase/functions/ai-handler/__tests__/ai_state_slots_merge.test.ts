import {
  extractSlotsFromUserText,
  __test__,
} from "../workflow/slots.ts";
import { assertEquals } from "https://deno.land/std@0.177.0/testing/asserts.ts";

Deno.test("ai_state slots merge preserves prior info + extraction does not drop slots", () => {
  const base = { vehicle_model: "Nexon", transmission: "automatic" };
  const preferred = { vehicle_variant: "Creative+" };

  const merged = __test__.mergeSlotsPreferNonEmpty(base, preferred);
  assertEquals(merged.vehicle_model, "Nexon");
  assertEquals(merged.transmission, "automatic");
  assertEquals(merged.vehicle_variant, "Creative+");

  const res = extractSlotsFromUserText("blue color", merged, {});

  // No throw + prior info preserved.
  assertEquals(res.next.vehicle_model, "Nexon");
  assertEquals(res.next.vehicle_variant, "Creative+");
  assertEquals(res.next.transmission, "automatic");
});
