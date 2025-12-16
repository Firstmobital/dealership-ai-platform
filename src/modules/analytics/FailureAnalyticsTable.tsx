// src/modules/analytics/FailureAnalyticsTable.tsx

import type { FailureAnalyticsRow } from "./analytics.types";

type Props = {
  rows: FailureAnalyticsRow[];
};

export function FailureAnalyticsTable({ rows }: Props) {
  return (
    <Section title="Failure Reasons">
      <Table headers={["Reason", "Count"]}>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>{r.failure_reason}</td>
            <td className="text-red-400">{r.failure_count}</td>
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
