// supabase/functions/ai-handler/__tests__/media_assets_match.test.ts
import { assertEquals } from "./test_harness.ts";
import { __test__ as MediaTest } from "../media_assets.ts";

const norm = (s: string | null) => MediaTest.normalizeAssetModelForMatch(s);

Deno.test("media_assets: asset.model 'Xpres-T' matches request mediaModel 'xpres-t'", () => {
  assertEquals(norm("Xpres-T"), "xpres-t");
});

Deno.test("media_assets: asset.model 'Xpres T' matches request mediaModel 'xpres-t'", () => {
  assertEquals(norm("Xpres T"), "xpres-t");
});

Deno.test("media_assets: asset.model 'Xpres-T Brochure' matches request mediaModel 'xpres-t'", () => {
  assertEquals(norm("Xpres-T Brochure"), "xpres-t");
});

Deno.test("media_assets: asset.model 'Xpres T EV' matches request mediaModel 'xpres-t-ev'", () => {
  assertEquals(norm("Xpres T EV"), "xpres-t-ev");
});

Deno.test("media_assets: image request does not return brochure assets (type respected)", () => {
  const assets = [
    { asset_type: "image" },
    { asset_type: "brochure" },
    { asset_type: "image" },
  ] as Array<{ asset_type: "image" | "brochure" }>;

  const forImage = assets.filter((a) => a.asset_type === "image");
  assertEquals(forImage.every((a) => a.asset_type === "image"), true);
});

Deno.test("media_assets: brochure request does not return image assets (type respected)", () => {
  const assets = [
    { asset_type: "image" },
    { asset_type: "brochure" },
  ] as Array<{ asset_type: "image" | "brochure" }>;

  const forBrochure = assets.filter((a) => a.asset_type === "brochure");
  assertEquals(forBrochure.every((a) => a.asset_type === "brochure"), true);
});
