// src/modules/analytics/OverviewCards.tsx

import type { CampaignAnalyticsRow } from "./analytics.types";

type Props = {
  campaigns: CampaignAnalyticsRow[];
  loading: boolean;
};

export function OverviewCards({ campaigns, loading }: Props) {
  const total = campaigns.reduce((a, c) => a + c.total_recipients, 0);
  const delivered = campaigns.reduce((a, c) => a + c.delivered_count, 0);
  const failed = campaigns.reduce((a, c) => a + c.failed_count, 0);

  const deliveryRate =
    total > 0 ? ((delivered / total) * 100).toFixed(1) : "0";

  if (loading) {
    return <div className="mb-4 text-slate-500">Loading analytics…</div>;
  }

  return (
    <div className="grid grid-cols-4 gap-4 mb-6">
      <Card title="Total Messages" value={total} />
      <Card title="Delivered" value={delivered} />
      <Card title="Failed" value={failed} />
      <Card title="Delivery %" value={`${deliveryRate}%`} />
    </div>
  );
}

function Card({ title, value }: { title: string; value: number | string }) {
  return (
    <div className="bg-slate-900/60 border border-white/10 rounded-xl p-4">
      <div className="text-xs text-slate-400">{title}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
