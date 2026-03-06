// supabase/functions/ai-handler/__tests__/model_normalize.test.ts
import { assertEquals } from "./test_harness.ts";
import {
  detectVehicleModelFromMessage,
  normalizeVehicleModelToken,
} from "../model_normalize.ts";

Deno.test("model_normalize: 'xpres t' -> xpres-t", () => {
  assertEquals(detectVehicleModelFromMessage("xpres t"), "xpres-t");
  assertEquals(normalizeVehicleModelToken("xpres t"), "xpres-t");
});

Deno.test("model_normalize: 'xpress t' -> xpres-t", () => {
  assertEquals(detectVehicleModelFromMessage("xpress t"), "xpres-t");
  assertEquals(normalizeVehicleModelToken("xpress t"), "xpres-t");
});

Deno.test("model_normalize: 'xpres t ev' -> xpres-t-ev", () => {
  assertEquals(detectVehicleModelFromMessage("xpres t ev"), "xpres-t-ev");
  assertEquals(normalizeVehicleModelToken("xpres t ev"), "xpres-t-ev");
});

Deno.test("model_normalize: 'harier' -> harrier", () => {
  assertEquals(detectVehicleModelFromMessage("harier"), "harrier");
  assertEquals(normalizeVehicleModelToken("harier"), "harrier");
});

Deno.test("model_normalize: 'curv ev' -> curvv-ev", () => {
  assertEquals(detectVehicleModelFromMessage("curv ev"), "curvv-ev");
  assertEquals(normalizeVehicleModelToken("curv ev"), "curvv-ev");
});

Deno.test("model_normalize: 'nexonn ev' -> nexon-ev", () => {
  assertEquals(detectVehicleModelFromMessage("nexonn ev"), "nexon-ev");
  assertEquals(normalizeVehicleModelToken("nexonn ev"), "nexon-ev");
});

Deno.test("model_normalize: normalizeVehicleModelToken handles EV typos", () => {
  assertEquals(normalizeVehicleModelToken("curv ev"), "curvv-ev");
  assertEquals(normalizeVehicleModelToken("nexonn ev"), "nexon-ev");
});
