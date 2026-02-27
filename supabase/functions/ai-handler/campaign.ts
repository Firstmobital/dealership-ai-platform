import { supabase } from "./clients.ts";
import { safeSupabase } from "./safe_helpers.ts";
import type { createLogger } from "./logging.ts";

/* ============================================================================
   PHASE 7A — CAMPAIGN CONTEXT HELPERS (FIXED: NO last_delivered_at)
============================================================================ */

export type TenancyFilter = { col: string; op: "eq"; value: unknown };

export function buildContactCampaignContextFilters(params: {
  organizationId: string;
  contactId: string;
}): TenancyFilter[] {
  return [
    { col: "id", op: "eq", value: params.contactId },
    { col: "organization_id", op: "eq", value: params.organizationId },
  ];
}

export async function fetchCampaignContextForContact(
  organizationId: string,
  contactId: string,
  logger: ReturnType<typeof createLogger>
) {
  const contactFilters = buildContactCampaignContextFilters({
    organizationId,
    contactId,
  });

  const contact = await safeSupabase<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    model: string | null;
    phone: string | null;
  }>("load_contact_for_campaign_context", logger, () => {
    let q = supabase
      .from("contacts")
      .select("id, first_name, last_name, model, phone");

    for (const f of contactFilters) q = q.eq(f.col, f.value);

    return q.maybeSingle();
  });

  if (!contact || !contact.phone) return null;

  const summary = await safeSupabase<{
    delivered_campaigns: string[] | null;
    failed_campaigns: string[] | null;
  }>("load_contact_campaign_summary", logger, () =>
    supabase
      .from("contact_campaign_summary")
      .select("delivered_campaigns, failed_campaigns")
      .eq("organization_id", organizationId)
      .eq("phone", contact.phone)
      .maybeSingle()
  );

  return {
    contact,
    delivered: summary?.delivered_campaigns ?? [],
    failed: summary?.failed_campaigns ?? [],
  };
}

export function buildCampaignContextText(
  ctx: {
    contact: {
      first_name: string | null;
      model: string | null;
      [k: string]: unknown;
    };
    delivered: string[];
    failed: string[];
  } | null
): string {
  if (!ctx) return "";

  const { contact, delivered, failed } = ctx;

  return `
CAMPAIGN HISTORY CONTEXT (IMPORTANT):

Customer:
- Name: ${contact.first_name ?? "Customer"}
- Vehicle model: ${contact.model ?? "Unknown"}

Campaign delivery history:
- Delivered templates: ${delivered.length ? delivered.join(", ") : "None"}
- Failed templates: ${failed.length ? failed.join(", ") : "None"}

Rules you MUST follow:
- Do NOT repeat offers/templates already delivered.
- If multiple failures exist, acknowledge difficulty reaching the customer.
`.trim();
}

export function buildCampaignFactsBlock(
  campaignContext: Record<string, unknown> | null
): string {
  if (!campaignContext) return "";

  return `
KNOWN FROM CAMPAIGN (DO NOT ASK AGAIN):
${Object.entries(campaignContext)
  .map(([k, v]) => `- ${k.replace(/_/g, " ")}: ${String(v)}`)
  .join("\n")}
`.trim();
}
