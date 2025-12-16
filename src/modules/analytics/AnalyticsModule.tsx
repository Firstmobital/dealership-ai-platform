// src/modules/analytics/AnalyticsModule.tsx

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useOrganizationStore } from "../../state/useOrganizationStore";

import { OverviewCards } from "./OverviewCards";
import { CampaignAnalyticsTable } from "./CampaignAnalyticsTable";
import { TemplateAnalyticsTable } from "./TemplateAnalyticsTable";
import { ModelAnalyticsTable } from "./ModelAnalyticsTable";
import { FailureAnalyticsTable } from "./FailureAnalyticsTable";

import type {
  CampaignAnalyticsRow,
  TemplateAnalyticsRow,
  ModelAnalyticsRow,
  FailureAnalyticsRow,
} from "./analytics.types";

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

      const [c, t, m, f] = await Promise.all([
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

      setCampaigns(
        (c.data ?? []).map((r) => ({
          ...r,
          total_recipients: r.total_recipients ?? 0,
          delivered_count: r.delivered_count ?? 0,
          failed_count: r.failed_count ?? 0,
          delivery_percent: r.delivery_percent ?? 0,
        }))
      );

      setTemplates(
        (t.data ?? []).map((r) => ({
          ...r,
          total_messages: r.total_messages ?? 0,
          delivered_count: r.delivered_count ?? 0,
          failed_count: r.failed_count ?? 0,
          delivery_percent: r.delivery_percent ?? 0,
        }))
      );

      setModels(
        (m.data ?? []).map((r) => ({
          ...r,
          total_messages: r.total_messages ?? 0,
          delivered_count: r.delivered_count ?? 0,
          failed_count: r.failed_count ?? 0,
          delivery_percent: r.delivery_percent ?? 0,
        }))
      );

      setFailures(
        (f.data ?? []).map((r) => ({
          ...r,
          failure_count: r.failure_count ?? 0,
        }))
      );

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
