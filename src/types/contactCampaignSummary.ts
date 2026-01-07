// src/types/contactCampaignSummary.ts
import type { UUID } from "./database";

/**
 * Shape returned by the DB view: public.contact_campaign_summary
 * (Read-only derived data)
 */
export type ContactCampaignSummary = {
  contact_id: UUID;
  organization_id: UUID;

  phone: string;
  first_name: string | null;
  last_name: string | null;
  model: string | null;

  // If your view has these fields, keep them.
  // If it doesn't, remove them OR make them optional.
  delivered_count?: number;
  failed_count?: number;
  last_sent_at?: string | null;

  // Optional: sometimes views include these
  name?: string | null;
  campaign_name?: string | null;
  status?: string | null;
};
