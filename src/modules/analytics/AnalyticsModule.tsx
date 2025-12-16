import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useOrganizationStore } from "../../state/useOrganizationStore";
import { OverviewCards } from "./OverviewCards";
import { CampaignAnalyticsTable } from "./CampaignAnalyticsTable";
import { TemplateAnalyticsTable } from "./TemplateAnalyticsTable";
import { ModelAnalyticsTable } from "./ModelAnalyticsTable";
import { FailureAnalyticsTable } from "./FailureAnalyticsTable";

export function AnalyticsModule() {
  const { currentOrganization } = useOrganizationStore();
  const [loading, setLoading] = useState(false);

  const [campaigns, setCampaigns] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [models, setModels] = useState([]);
  const [failures, setFailures] = useState([]);

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

      setCampaigns(c.data ?? []);
      setTemplates(t.data ?? []);
      setModels(m.data ?? []);
      setFailures(f.data ?? []);

      setLoading(false);
    };

    fetchAll();
  }, [currentOrganization?.id]);

  return (
    <div className="h-full w-full p-4 overflow-y-auto">
      <h1 className="text-sm font-semibold mb-4">Analytics</h1>

      <OverviewCards
        campaigns={campaigns}
        loading={loading}
      />

      <CampaignAnalyticsTable rows={campaigns} />
      <TemplateAnalyticsTable rows={templates} />
      <ModelAnalyticsTable rows={models} />
      <FailureAnalyticsTable rows={failures} />
    </div>
  );
}
