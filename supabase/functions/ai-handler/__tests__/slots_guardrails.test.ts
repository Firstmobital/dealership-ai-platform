// supabase/functions/ai-handler/__tests__/slots_guardrails.test.ts
import { assertEquals } from "./test_harness.ts";
import { extractSlotsFromUserText, __test__ } from "../workflow/slots.ts";

Deno.test("slots: extractSlotsFromUserText does not throw when opts is omitted", () => {
  const res = extractSlotsFromUserText("xpress t", {}, /* opts omitted */);
  assertEquals(typeof res, "object");
  assertEquals(res.next.vehicle_model, "xpres-t");
});

Deno.test("slots: model normalization makes Xpres-T variants consistent", () => {
  const a = __test__.normModelValue("Xpres-T");
  const b = __test__.normModelValue("xpress t");
  const c = __test__.normModelValue("xpres-t");

  // Expected normalized form: lower-case + hyphen for '-t'
  assertEquals(a, "xpres-t");
  assertEquals(b, "xpress t");
  assertEquals(c, "xpres-t");

  // But extraction candidate should converge to canonical "xpres-t" for all these inputs.
  const r1 = extractSlotsFromUserText("Xpres-T", {}, undefined);
  const r2 = extractSlotsFromUserText("xpress t", {}, undefined);
  const r3 = extractSlotsFromUserText("xpres-t", {}, undefined);

  assertEquals(r1.next.vehicle_model, "xpres-t");
  assertEquals(r2.next.vehicle_model, "xpres-t");
  assertEquals(r3.next.vehicle_model, "xpres-t");
});
