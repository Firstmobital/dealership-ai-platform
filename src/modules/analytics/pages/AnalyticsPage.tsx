import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useOrganizationStore } from "../../../state/useOrganizationStore";
import { useSubOrganizationStore } from "../../../state/useSubOrganizationStore";

type Metrics = {
  totalContacts: number;
  contactedContacts: number;
  deliveredCampaigns: number;
  failedCampaigns: number;
};

export default function AnalyticsPage() {
  const { currentOrganization } = useOrganizationStore();
  const { activeSubOrg } = useSubOrganizationStore();

  const organizationId = currentOrganization?.id;
  const subOrganizationId = activeSubOrg?.id;

  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) return;

    async function loadMetrics() {
      setLoading(true);

      // Contacts count
      let contactsQuery = supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId);

      if (subOrganizationId) {
        contactsQuery = contactsQuery.eq(
          "sub_organization_id",
          subOrganizationId
        );
      }

      const { count: totalContacts } = await contactsQuery;

      // Campaign summary
      let summaryQuery = supabase
        .from("contact_campaign_summary")
        .select("delivered_campaigns, failed_campaigns")
        .eq("organization_id", organizationId);

      if (subOrganizationId) {
        summaryQuery = summaryQuery.eq(
          "sub_organization_id",
          subOrganizationId
        );
      }

      const { data: summaries } = await summaryQuery;

      let contactedContacts = 0;
      let deliveredCampaigns = 0;
      let failedCampaigns = 0;

      summaries?.forEach((row) => {
        const delivered = row.delivered_campaigns?.length || 0;
        const failed = row.failed_campaigns?.length || 0;

        if (delivered + failed > 0) contactedContacts++;
        deliveredCampaigns += delivered;
        failedCampaigns += failed;
      });

      setMetrics({
        totalContacts: totalContacts || 0,
        contactedContacts,
        deliveredCampaigns,
        failedCampaigns,
      });

      setLoading(false);
    }

    loadMetrics();
  }, [organizationId, subOrganizationId]);

  if (loading || !metrics) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        Loading analytics…
      </div>
    );
  }

  return (
    <div className="h-full w-full p-6">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">
        Analytics
      </h1>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricCard
          label="Total Contacts"
          value={metrics.totalContacts}
        />
        <MetricCard
          label="Contacted Contacts"
          value={metrics.contactedContacts}
        />
        <MetricCard
          label="Delivered Campaigns"
          value={metrics.deliveredCampaigns}
        />
        <MetricCard
          label="Failed Campaigns"
          value={metrics.failedCampaigns}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* METRIC CARD                                                               */
/* -------------------------------------------------------------------------- */
function MetricCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border bg-white p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-slate-900">
        {value}
      </p>
    </div>
  );
}
