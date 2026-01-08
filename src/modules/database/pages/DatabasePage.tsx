import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useOrganizationStore } from "../../../state/useOrganizationStore";
import { DatabaseUploadModal } from "../components/DatabaseUploadModal";

/* -------------------------------------------------------------------------- */
/* TYPES                                                                      */
/* -------------------------------------------------------------------------- */
type ContactSummary = {
  phone: string;
  first_name: string | null;
  last_name: string | null;
  model: string | null;
  delivered_campaigns: string[] | null;
  failed_campaigns: string[] | null;
};

/* -------------------------------------------------------------------------- */
/* PAGE                                                                       */
/* -------------------------------------------------------------------------- */
export default function DatabasePage() {
  /* ------------------------- Org / Sub-org Context ------------------------ */
  const { activeOrganization } = useOrganizationStore();

  const organizationId = activeOrganization?.id;

  /* ----------------------------- State ------------------------------------ */
  const [rows, setRows] = useState<ContactSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);

  /* ----------------------------- Filters ---------------------------------- */
  const [phoneFilter, setPhoneFilter] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [campaignFilter, setCampaignFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "delivered" | "failed" | "never"
  >("all");

  /* ----------------------------- Data Load -------------------------------- */
  useEffect(() => {
    if (!organizationId) return;

    async function loadData() {
      setLoading(true);

      let query = supabase
        .from("contact_campaign_summary")
        .select("*")
        .eq("organization_id", organizationId);

      const { data, error } = await query;

      if (error) {
        console.error("Database fetch error:", error);
      } else {
        setRows(data || []);
      }

      setLoading(false);
    }

    loadData();
  }, [organizationId]);

  /* ---------------------------- Filtering --------------------------------- */
  const filteredRows = rows.filter((row) => {
    if (phoneFilter && !row.phone.includes(phoneFilter)) return false;

    if (
      modelFilter &&
      !row.model?.toLowerCase().includes(modelFilter.toLowerCase())
    )
      return false;

    const allCampaigns = [
      ...(row.delivered_campaigns || []),
      ...(row.failed_campaigns || []),
    ];

    if (
      campaignFilter &&
      !allCampaigns.some((c) =>
        c.toLowerCase().includes(campaignFilter.toLowerCase())
      )
    )
      return false;

    if (statusFilter === "delivered") {
      return (row.delivered_campaigns?.length || 0) > 0;
    }

    if (statusFilter === "failed") {
      return (row.failed_campaigns?.length || 0) > 0;
    }

    if (statusFilter === "never") {
      return (
        (row.delivered_campaigns?.length || 0) === 0 &&
        (row.failed_campaigns?.length || 0) === 0
      );
    }

    return true;
  });

  /* ------------------------------------------------------------------------ */
  return (
    <div className="h-full w-full p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Database
          </h1>
          <p className="text-sm text-slate-500">
            Read-only CRM intelligence from contacts & campaigns
          </p>
        </div>

        <button
          onClick={() => setShowUpload(true)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Upload Contacts
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <input
          className="w-56 rounded-md border px-3 py-2 text-sm"
          placeholder="Search phone"
          value={phoneFilter}
          onChange={(e) => setPhoneFilter(e.target.value)}
        />

        <input
          className="w-40 rounded-md border px-3 py-2 text-sm"
          placeholder="Model"
          value={modelFilter}
          onChange={(e) => setModelFilter(e.target.value)}
        />

        <input
          className="w-48 rounded-md border px-3 py-2 text-sm"
          placeholder="Campaign name"
          value={campaignFilter}
          onChange={(e) => setCampaignFilter(e.target.value)}
        />

        <select
          className="rounded-md border px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as any)
          }
        >
          <option value="all">All</option>
          <option value="delivered">Delivered</option>
          <option value="failed">Failed</option>
          <option value="never">Never Contacted</option>
        </select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex h-[60vh] items-center justify-center text-slate-500">
          Loading database…
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="flex h-[60vh] items-center justify-center text-slate-500">
          No matching contacts found
        </div>
      ) : (
        <div className="max-h-[calc(100vh-280px)] overflow-auto rounded-lg border bg-white">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 text-left">Phone</th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Model</th>
                <th className="px-4 py-3 text-left">
                  Delivered Campaigns
                </th>
                <th className="px-4 py-3 text-left">
                  Failed Campaigns
                </th>
              </tr>
            </thead>

            <tbody>
              {filteredRows.map((row) => (
                <tr
                  key={row.phone}
                  className="border-t hover:bg-slate-50"
                >
                  <td className="px-4 py-2 font-mono">
                    {row.phone}
                  </td>
                  <td className="px-4 py-2">
                    {[row.first_name, row.last_name]
                      .filter(Boolean)
                      .join(" ") || "—"}
                  </td>
                  <td className="px-4 py-2">
                    {row.model || "—"}
                  </td>
                  <td className="px-4 py-2">
                    <CampaignChips
                      items={row.delivered_campaigns}
                      color="green"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <CampaignChips
                      items={row.failed_campaigns}
                      color="red"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <DatabaseUploadModal
          onClose={() => setShowUpload(false)}
          onSuccess={() => {
            setShowUpload(false);
            // reload data
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* CAMPAIGN CHIPS                                                             */
/* -------------------------------------------------------------------------- */
function CampaignChips({
  items,
  color,
}: {
  items: string[] | null;
  color: "green" | "red";
}) {
  if (!items || items.length === 0) {
    return <span className="text-slate-400">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <span
          key={item}
          className={
            "rounded-full px-2 py-0.5 text-xs " +
            (color === "green"
              ? "bg-green-100 text-green-700"
              : "bg-red-100 text-red-700")
          }
        >
          {item}
        </span>
      ))}
    </div>
  );
}
