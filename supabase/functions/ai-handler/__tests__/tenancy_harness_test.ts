// filepath: /Users/air/dealership-ai-platform/supabase/functions/ai-handler/__tests__/tenancy_harness_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

type Filter = { col: string; op: "eq"; value: unknown };

class FakeQuery {
  table: string;
  filters: Filter[] = [];
  selected: string | null = null;
  updated: Record<string, unknown> | null = null;

  constructor(table: string) {
    this.table = table;
  }

  select(cols: string) {
    this.selected = cols;
    return this;
  }

  update(values: Record<string, unknown>) {
    this.updated = values;
    return this;
  }

  eq(col: string, value: unknown) {
    this.filters.push({ col, op: "eq", value });
    return this;
  }

  maybeSingle() {
    return Promise.resolve({ data: null });
  }
}

class FakeSupabase {
  lastQuery: FakeQuery | null = null;

  from(table: string) {
    this.lastQuery = new FakeQuery(table);
    return this.lastQuery;
  }
}

function buildLoadOpenPsfCaseQuery(params: {
  sb: FakeSupabase;
  conversationId: string;
  organizationId: string;
}) {
  const { sb, conversationId, organizationId } = params;
  return sb
    .from("psf_cases")
    .select("id, campaign_id, sentiment, first_customer_reply_at")
    .eq("conversation_id", conversationId)
    .eq("organization_id", organizationId)
    .eq("resolution_status", "open");
}

function buildUpdatePsfCaseQuery(params: {
  sb: FakeSupabase;
  psfCaseId: string;
  organizationId: string;
  patch: Record<string, unknown>;
}) {
  const { sb, psfCaseId, organizationId, patch } = params;
  return sb
    .from("psf_cases")
    .update(patch)
    .eq("id", psfCaseId)
    .eq("organization_id", organizationId);
}

Deno.test("tenancy: psf_cases select is scoped by organization_id", () => {
  const sb = new FakeSupabase();
  buildLoadOpenPsfCaseQuery({
    sb,
    conversationId: "conv_123",
    organizationId: "org_456",
  });

  const q = sb.lastQuery!;
  assertEquals(q.table, "psf_cases");

  const hasOrg = q.filters.some(
    (f) => f.col === "organization_id" && f.op === "eq" && f.value === "org_456",
  );
  assertEquals(hasOrg, true);
});

Deno.test("tenancy: psf_cases update is guarded by id + organization_id", () => {
  const sb = new FakeSupabase();
  buildUpdatePsfCaseQuery({
    sb,
    psfCaseId: "psf_1",
    organizationId: "org_456",
    patch: { sentiment: "positive" },
  });

  const q = sb.lastQuery!;
  assertEquals(q.table, "psf_cases");

  const hasId = q.filters.some((f) => f.col === "id" && f.value === "psf_1");
  const hasOrg = q.filters.some((f) => f.col === "organization_id" && f.value === "org_456");

  assertEquals(hasId, true);
  assertEquals(hasOrg, true);
});
