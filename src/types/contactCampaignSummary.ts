// src/types/contactCampaignSummary.ts
import type { UUID } from "./database";

/**
 * Raw row returned by DB view: public.contact_campaign_summary
 * This is NOT a UI type. This mirrors DB output.
 */
export type ContactCampaignSummary = {
  contact_id: UUID;
  organization_id: UUID;

  first_name: string | null;
  last_name: string | null;
  phone: string;
  model: string | null;

  /**
   * Campaign names grouped by delivery status
   * (can be NULL at DB level → normalize in module)
   */
  delivered_campaigns: string[] | null;
  failed_campaigns: string[] | null;
};
