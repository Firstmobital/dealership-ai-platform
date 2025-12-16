// src/modules/analytics/AnalyticsModule.tsx

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useOrganizationStore } from "../../state/useOrganizationStore";

import { OverviewCards } from "./OverviewCards";
import { CampaignAnalyticsTable } from "./CampaignAnalyticsTable";
import { TemplateAnalyticsTable } from "./TemplateAnalyticsTable";
import { ModelAnalyticsTable } from "./ModelAnalyticsTable";
import { FailureAnalyticsTable } from "./FailureAnalyticsTable";

/* ------------------------------------------------------------------ */
/* TYPES — aligned with Supabase views                                 */
/* ------------------------------------------------------------------ */

type CampaignAnalyticsRow = {
  campaign_id: string;
  campaign_name: string;
  template_name: string;
  total_recipients: number | null;
  delivered_count: number | null;
  failed_count: number | null;
  delivery_percent: number | null;
};

type TemplateAnalyticsRow = {
  template_name: string;
  total_messages: number | null;
  delivered_count: number | null;
  failed_count: number | null;
  delivery_percent: number | null;
};

type ModelAnalyticsRow = {
  model: string;
  total_messages: number | null;
  delivered_count: number | null;
  failed_count: number | null;
  delivery_percent: number | null;
};

type FailureAnalyticsRow = {
  failure_reason: string;
  failure_count: number | null;
};

/* ------------------------------------------------------------------ */

export function AnalyticsModule() {
  const { currentOrganization } = useOrganizationStore();
  const [loading, setLoading] = useState(false);

  const [campaigns, setCampaigns] = useState<CampaignAnalyticsRow[]>([]);
  const [templates, setTemplates] = useState<TemplateAnalyticsRow[]>([]);
  const [models, setModels] = useState<ModelAnalyticsRow[]>([]);
  const [failures, setFailures] = useState<FailureAnalyticsRow[]>([]);

  useEffect(() => {
    if (!currentOrganization?.id) return;

    const fetchAll = async () => {
      setLoading(true);

      const [
        campaignsRes,
        templatesRes,
        modelsRes,
        failuresRes,
      ] = await Promise.all([
        supabase
          .from("campaign_analytics_summary")
          .select("*")
          .eq("organization_id", currentOrganization.id),

        supabase
          .from("template_analytics_summary")
          .select("*")
          .eq("organization_id", currentOrganization.id),

        supabase
          .from("model_analytics_summary")
          .select("*")
          .eq("organization_id", currentOrganization.id),

        supabase
          .from("failure_reason_summary")
          .select("*")
          .eq("organization_id", currentOrganization.id),
      ]);

      setCampaigns((campaignsRes.data ?? []) as CampaignAnalyticsRow[]);
      setTemplates((templatesRes.data ?? []) as TemplateAnalyticsRow[]);
      setModels((modelsRes.data ?? []) as ModelAnalyticsRow[]);
      setFailures((failuresRes.data ?? []) as FailureAnalyticsRow[]);

      setLoading(false);
    };

    fetchAll();
  }, [currentOrganization?.id]);

  return (
    <div className="h-full w-full p-4 overflow-y-auto">
      <h1 className="text-sm font-semibold mb-4">Analytics</h1>

      <OverviewCards campaigns={campaigns} loading={loading} />

      <CampaignAnalyticsTable rows={campaigns} />
      <TemplateAnalyticsTable rows={templates} />
      <ModelAnalyticsTable rows={models} />
      <FailureAnalyticsTable rows={failures} />
    </div>
  );
}
