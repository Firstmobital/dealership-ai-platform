// src/modules/analytics/CampaignAnalyticsTable.tsx

import type { CampaignAnalyticsRow } from "./analytics.types";

type Props = {
  rows: CampaignAnalyticsRow[];
};

export function CampaignAnalyticsTable({ rows }: Props) {
  return (
    <Section title="Campaign Performance">
      <Table
        headers={[
          "Campaign",
          "Template",
          "Total",
          "Delivered",
          "Failed",
          "Delivery %",
        ]}
      >
        {rows.map((r) => (
          <tr key={r.campaign_id}>
            <td>{r.campaign_name}</td>
            <td>{r.template_name}</td>
            <td>{r.total_recipients}</td>
            <td className="text-green-400">{r.delivered_count}</td>
            <td className="text-red-400">{r.failed_count}</td>
            <td>{r.delivery_percent}%</td>
          </tr>
        ))}
      </Table>
    </Section>
  );
}

/* ------------------------------------------------------------------ */

type SectionProps = {
  title: string;
  children: React.ReactNode;
};

function Section({ title, children }: SectionProps) {
  return (
    <div className="mb-8">
      <h2 className="text-sm font-semibold mb-2">{title}</h2>
      <div className="bg-slate-900/60 border border-white/10 rounded-xl overflow-hidden">
        {children}
      </div>
    </div>
  );
}

type TableProps = {
  headers: string[];
  children: React.ReactNode;
};

function Table({ headers, children }: TableProps) {
  return (
    <table className="w-full text-xs">
      <thead className="bg-slate-800 text-slate-400">
        <tr>
          {headers.map((h) => (
            <th key={h} className="p-2 text-left">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-white/5">{children}</tbody>
    </table>
  );
}
  