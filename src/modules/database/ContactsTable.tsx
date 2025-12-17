// src/modules/database/ContactsTable.tsx
// FULL + FINAL — Tier 5
// Enterprise CRM table
// Logic untouched

type ContactRow = {
  first_name: string | null;
  last_name: string | null;
  phone: string;
  model: string | null;
  delivered_campaigns: string[];
  failed_campaigns: string[];
};

type Filters = {
  phone: string;
  model: string;
  campaign: string;
  status: string;
};

type Props = {
  rows: ContactRow[];
  filters: Filters;
  loading: boolean;
};

export function ContactsTable({ rows, filters, loading }: Props) {
  const filtered = rows.filter((r) => {
    if (filters.phone && !r.phone.includes(filters.phone)) return false;
    if (filters.model && r.model !== filters.model) return false;

    if (filters.campaign) {
      const all = [...r.delivered_campaigns, ...r.failed_campaigns];
      if (
        !all.some((c) =>
          c.toLowerCase().includes(filters.campaign.toLowerCase()),
        )
      )
        return false;
    }

    if (
      filters.status === "delivered" &&
      r.delivered_campaigns.length === 0
    )
      return false;

    if (filters.status === "failed" && r.failed_campaigns.length === 0)
      return false;

    if (
      filters.status === "never" &&
      (r.delivered_campaigns.length > 0 ||
        r.failed_campaigns.length > 0)
    )
      return false;

    return true;
  });

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        Loading contacts…
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        No matching records
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-collapse text-sm">
        {/* HEADER */}
        <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-slate-600">
              First
            </th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">
              Last
            </th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">
              Phone
            </th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">
              Model
            </th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">
              Delivered
            </th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">
              Failed
            </th>
            <th className="px-4 py-3 text-right font-medium text-slate-600">
              Action
            </th>
          </tr>
        </thead>

        {/* BODY */}
        <tbody>
          {filtered.map((r) => (
            <tr
              key={r.phone}
              className="border-b border-slate-200 hover:bg-slate-50"
            >
              <td className="px-4 py-3">
                {r.first_name ?? "-"}
              </td>

              <td className="px-4 py-3">
                {r.last_name ?? "-"}
              </td>

              <td className="px-4 py-3 font-mono text-xs">
                {r.phone}
              </td>

              <td className="px-4 py-3">
                {r.model ?? "-"}
              </td>

              <td className="px-4 py-3">
                {r.delivered_campaigns.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {r.delivered_campaigns.map((c) => (
                      <span
                        key={c}
                        className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] text-green-700"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-slate-400 text-xs">—</span>
                )}
              </td>

              <td className="px-4 py-3">
                {r.failed_campaigns.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {r.failed_campaigns.map((c) => (
                      <span
                        key={c}
                        className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] text-red-700"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-slate-400 text-xs">—</span>
                )}
              </td>

              <td className="px-4 py-3 text-right">
                {r.failed_campaigns.length > 0 && (
                  <button className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100">
                    Retry
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
