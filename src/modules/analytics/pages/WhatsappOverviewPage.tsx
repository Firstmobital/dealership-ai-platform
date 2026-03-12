///Users/air/dealership-ai-platform/src/modules/analytics/pages/WhatsappOverviewPage.tsx
import { useEffect, useState } from "react";
import { useAnalyticsStore } from "../../../state/useAnalyticsStore";
import { WhatsappVolumeChart } from "../components/WhatsappVolumeChart";
import { WhatsappEffectivenessChart } from "../components/WhatsappEffectivenessChart";

/* ============================================================================
   WHATSAPP OVERVIEW PAGE
   Phase 3A – Analytics Dashboard
============================================================================ */

export function WhatsappOverviewPage() {
  const {
    overview,
    workflowUsage,
    fetchOverview,
    fetchWorkflowUsage,
    loading,
  } = useAnalyticsStore();

  /* --------------------------------------------------------------------------
     DATE RANGE (default: last 7 days)
  -------------------------------------------------------------------------- */
  const [from, setFrom] = useState(() =>
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
  );
  const [to, setTo] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );

  useEffect(() => {
    fetchOverview(from, to);
  }, [from, to]);

  useEffect(() => {
    fetchWorkflowUsage();
  }, []);

  /* --------------------------------------------------------------------------
     KPI CALCULATIONS
  -------------------------------------------------------------------------- */
  const totals = overview.reduce(
    (acc: any, row: any) => {
      acc.inbound += row.inbound_messages ?? 0;
      acc.outbound += row.outbound_messages ?? 0;
      acc.delivered += row.delivered_messages ?? 0;
      acc.replies += row.replied_messages ?? 0;
      acc.activeChats = Math.max(
        acc.activeChats,
        row.active_conversations ?? 0
      );
      return acc;
    },
    {
      inbound: 0,
      outbound: 0,
      delivered: 0,
      replies: 0,
      activeChats: 0,
    }
  );

  const deliveryRate =
    totals.outbound > 0
      ? Math.round((totals.delivered / totals.outbound) * 100)
      : 0;

  const replyRate =
    totals.delivered > 0
      ? Math.round((totals.replies / totals.delivered) * 100)
      : 0;

  /* --------------------------------------------------------------------------
     UI
  -------------------------------------------------------------------------- */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">
          WhatsApp Analytics
        </h1>

        {/* Date Filters */}
        <div className="flex gap-2">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded border px-2 py-1 text-sm"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded border px-2 py-1 text-sm"
          />
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <KpiCard label="Inbound" value={totals.inbound} />
        <KpiCard label="Outbound" value={totals.outbound} />
        <KpiCard label="Delivered %" value={`${deliveryRate}%`} />
        <KpiCard label="Reply %" value={`${replyRate}%`} />
        <KpiCard label="Active Chats" value={totals.activeChats} />
      </div>

      {/* CHARTS */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <WhatsappVolumeChart data={overview} />
        <WhatsappEffectivenessChart data={overview} />
      </div>

      {/* WORKFLOW ANALYTICS */}
      <div className="rounded-lg border bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Workflow Usage</h2>
          <p className="text-xs text-slate-500">Started, active, completed, escalated, avg step</p>
        </div>

        {workflowUsage.length === 0 && !loading ? (
          <p className="text-sm text-slate-500">No workflow usage found for this organization.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Workflow</th>
                  <th className="px-3 py-2">Started</th>
                  <th className="px-3 py-2">Completed</th>
                  <th className="px-3 py-2">Escalated</th>
                  <th className="px-3 py-2">Active</th>
                  <th className="px-3 py-2">Avg Step</th>
                </tr>
              </thead>
              <tbody>
                {workflowUsage.map((row) => (
                  <tr key={row.workflow_id} className="border-b last:border-b-0">
                    <td className="px-3 py-2 font-medium text-slate-900">{row.workflow_name}</td>
                    <td className="px-3 py-2 text-slate-700">{row.started_count}</td>
                    <td className="px-3 py-2 text-slate-700">{row.completed_count}</td>
                    <td className="px-3 py-2 text-slate-700">{row.escalated_count}</td>
                    <td className="px-3 py-2 text-slate-700">{row.active_count}</td>
                    <td className="px-3 py-2 text-slate-700">{row.avg_current_step}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* EMPTY STATE */}
      {!loading && overview.length === 0 && (
        <div className="rounded-lg border bg-slate-50 p-6 text-center text-sm text-slate-500">
          No WhatsApp activity for the selected date range.
        </div>
      )}

      {/* LOADING */}
      {loading && (
        <p className="text-sm text-slate-500">Loading analytics…</p>
      )}
    </div>
  );
}

/* ============================================================================
   KPI CARD (LOCAL)
============================================================================ */

function KpiCard({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
