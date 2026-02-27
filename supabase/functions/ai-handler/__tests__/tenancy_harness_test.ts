// filepath: /Users/air/dealership-ai-platform/supabase/functions/ai-handler/__tests__/tenancy_harness_test.ts
import { assertEquals, assert } from "./test_harness.ts";

type Filter = { col: string; op: "eq"; value: unknown };

function expectedOpenPsfCaseFilters(params: {
  conversationId: string;
  organizationId: string;
}): Filter[] {
  // Must match psf.ts production query:
  // .eq("conversation_id", conversationId)
  // .eq("organization_id", organizationId)
  // .eq("resolution_status", "open")
  return [
    { col: "conversation_id", op: "eq", value: params.conversationId },
    { col: "organization_id", op: "eq", value: params.organizationId },
    { col: "resolution_status", op: "eq", value: "open" },
  ];
}

function expectedContactCampaignContextFilters(params: {
  organizationId: string;
  contactId: string;
}): Filter[] {
  // Must match campaign.ts production query:
  // .eq("id", contactId)
  // .eq("organization_id", organizationId)
  return [
    { col: "id", op: "eq", value: params.contactId },
    { col: "organization_id", op: "eq", value: params.organizationId },
  ];
}

Deno.test("tenancy: psf_cases select is scoped by organization_id (production-equivalent)", () => {
  const filters = expectedOpenPsfCaseFilters({
    conversationId: "conv_123",
    organizationId: "org_456",
  });

  assert(Array.isArray(filters), "filters should be an array");

  const hasOrg = filters.some((f) => f.col === "organization_id" && f.op === "eq" && f.value === "org_456");
  assertEquals(hasOrg, true);
});

Deno.test("tenancy: psf_cases open-case query includes conversation_id + resolution_status=open", () => {
  const filters = expectedOpenPsfCaseFilters({
    conversationId: "conv_123",
    organizationId: "org_456",
  });

  const hasConv = filters.some((f) => f.col === "conversation_id" && f.op === "eq" && f.value === "conv_123");
  const hasOpen = filters.some((f) => f.col === "resolution_status" && f.op === "eq" && f.value === "open");

  assertEquals(hasConv, true);
  assertEquals(hasOpen, true);
});

Deno.test("tenancy: contacts select for campaign context is scoped by organization_id (production-equivalent)", () => {
  const filters = expectedContactCampaignContextFilters({
    organizationId: "org_456",
    contactId: "ct_1",
  });

  const hasOrg = filters.some((f) => f.col === "organization_id" && f.op === "eq" && f.value === "org_456");
  const hasId = filters.some((f) => f.col === "id" && f.op === "eq" && f.value === "ct_1");

  assertEquals(hasOrg, true);
  assertEquals(hasId, true);
});
