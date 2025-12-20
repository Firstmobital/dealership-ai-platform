import {
  Megaphone,
  Upload,
  Play,
  PlusCircle,
  Clock,
  Loader2,
} from "lucide-react";

import { useEffect, useMemo, useState } from "react";
import { useCampaignStore } from "../../state/useCampaignStore";
import { useWhatsappTemplateStore } from "../../state/useWhatsappTemplateStore";
import { useOrganizationStore } from "../../state/useOrganizationStore";
import { useSubOrganizationStore } from "../../state/useSubOrganizationStore";

/* ======================================================================== */
/* TYPES                                                                     */
/* ======================================================================== */
type ParsedCsvRow = {
  phone: string;
  variables: Record<string, string>;
};

type BuilderState = {
  name: string;
  description: string;
  template_id: string;
};

/* ======================================================================== */
/* CSV HELPERS                                                               */
/* ======================================================================== */
function parseSimpleCsv(raw: string) {
  const rows = raw.trim().split("\n").map((r) => r.split(","));
  const headers = rows[0] || [];
  const dataRows = rows.slice(1);
  return { headers, rows: dataRows };
}

function mapCsvRowsToObjects(
  headers: string[],
  rows: string[][]
): ParsedCsvRow[] {
  return rows.map((cols) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h] = cols[i] || ""));
    const phone = obj["phone"]?.trim() ?? "";
    delete obj["phone"];
    return { phone, variables: obj };
  });
}

/* ======================================================================== */
/* COMPONENT                                                                 */
/* ======================================================================== */
export function CampaignsModule() {
  const {
    campaigns,
    messages,
    loading,
    fetchCampaigns,
    fetchCampaignMessages,
    createCampaignWithMessages,
    launchCampaign,
  } = useCampaignStore();

  const {
    templates,
    fetchApprovedTemplates,
    loading: templatesLoading,
  } = useWhatsappTemplateStore();

  const { currentOrganization } = useOrganizationStore();
  const { activeSubOrg } = useSubOrganizationStore();

  const [selectedCampaignId, setSelectedCampaignId] =
    useState<string | null>(null);

  const [builder, setBuilder] = useState<BuilderState>({
    name: "",
    description: "",
    template_id: "",
  });

  const [csvText, setCsvText] = useState("");
  const [parsedRows, setParsedRows] = useState<ParsedCsvRow[]>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [launchingId, setLaunchingId] = useState<string | null>(null);

  /* -------------------------------------------------------------------- */
  /* LOAD DATA                                                            */
  /* -------------------------------------------------------------------- */
  useEffect(() => {
    if (!currentOrganization?.id) return;

    fetchCampaigns(currentOrganization.id);
    fetchApprovedTemplates(currentOrganization.id);
  }, [currentOrganization?.id, activeSubOrg?.id]);

  useEffect(() => {
    if (selectedCampaignId && !messages[selectedCampaignId]) {
      fetchCampaignMessages(selectedCampaignId);
    }
  }, [selectedCampaignId]);

  /* -------------------------------------------------------------------- */
  /* CSV PARSE                                                            */
  /* -------------------------------------------------------------------- */
  useEffect(() => {
    if (!csvText.trim()) {
      setParsedRows([]);
      setCsvErrors([]);
      return;
    }

    const parsed = parseSimpleCsv(csvText);
    const errors: string[] = [];

    if (!parsed.headers.includes("phone")) {
      errors.push("CSV must include a 'phone' column.");
    }

    const rows = mapCsvRowsToObjects(parsed.headers, parsed.rows);
    setParsedRows(rows);
    setCsvErrors(errors);
  }, [csvText]);

  /* -------------------------------------------------------------------- */
  /* CREATE CAMPAIGN (DRAFT)                                               */
  /* -------------------------------------------------------------------- */
  async function onCreateCampaign() {
    if (!currentOrganization?.id) return;

    if (!builder.name || !builder.template_id) {
      alert("Campaign name and template are required.");
      return;
    }

    if (csvErrors.length > 0 || parsedRows.length === 0) {
      alert("Fix CSV errors before creating campaign.");
      return;
    }

    try {
      setCreating(true);

      const id = await createCampaignWithMessages({
        organizationId: currentOrganization.id,
        sub_organization_id: activeSubOrg?.id ?? null,
        name: builder.name,
        description: builder.description,
        template_id: builder.template_id,
        scheduledAt: null, // ✅ DRAFT
        rows: parsedRows,
      });

      setSelectedCampaignId(id);
      setBuilder({ name: "", description: "", template_id: "" });
      setCsvText("");
    } finally {
      setCreating(false);
    }
  }

  /* -------------------------------------------------------------------- */
  /* LAUNCH CAMPAIGN                                                       */
  /* -------------------------------------------------------------------- */
  async function onLaunch(campaignId: string) {
    if (!confirm("This will start sending WhatsApp messages immediately.")) {
      return;
    }

    try {
      setLaunchingId(campaignId);
      await launchCampaign(campaignId);
    } finally {
      setLaunchingId(null);
    }
  }

  /* -------------------------------------------------------------------- */
  /* ORDER: SUB-ORG FIRST                                                  */
  /* -------------------------------------------------------------------- */
  const orderedCampaigns = useMemo(() => {
    if (!activeSubOrg) return campaigns;

    return [...campaigns].sort((a, b) => {
      const aLocal = a.sub_organization_id === activeSubOrg.id;
      const bLocal = b.sub_organization_id === activeSubOrg.id;
      return aLocal === bLocal ? 0 : aLocal ? -1 : 1;
    });
  }, [campaigns, activeSubOrg]);

  /* ===================================================================== */
  /* UI                                                                    */
  /* ===================================================================== */
  return (
    <div className="flex h-full w-full gap-6 px-6 py-6">
      {/* LEFT */}
      <div className="w-[380px] flex flex-col gap-4">
        {/* BUILDER */}
        <div className="rounded-lg border bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <PlusCircle size={16} className="text-blue-600" />
            <h2 className="text-sm font-semibold">Create Campaign</h2>
          </div>

          <input
            className="mb-2 w-full rounded-md border px-3 py-2 text-sm"
            placeholder="Campaign name"
            value={builder.name}
            onChange={(e) =>
              setBuilder((p) => ({ ...p, name: e.target.value }))
            }
          />

          <select
            className="mb-2 w-full rounded-md border px-3 py-2 text-sm"
            value={builder.template_id}
            onChange={(e) =>
              setBuilder((p) => ({ ...p, template_id: e.target.value }))
            }
            disabled={templatesLoading}
          >
            <option value="">Select Approved Template</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.language})
              </option>
            ))}
          </select>

          <textarea
            className="mb-2 w-full rounded-md border px-3 py-2 text-xs font-mono"
            rows={5}
            placeholder="Paste CSV (must include phone column)"
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
          />

          {csvErrors.length > 0 && (
            <div className="mb-2 text-xs text-red-600">
              {csvErrors.map((e) => (
                <div key={e}>❌ {e}</div>
              ))}
            </div>
          )}

          <button
            onClick={onCreateCampaign}
            disabled={creating}
            className="mt-2 w-full rounded-md bg-blue-600 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? (
              <Loader2 size={16} className="animate-spin mx-auto" />
            ) : (
              "Create Draft Campaign"
            )}
          </button>
        </div>

        {/* LIST */}
        <div className="flex-1 rounded-lg border bg-white p-4 overflow-y-auto">
          <div className="mb-2 flex items-center gap-2">
            <Megaphone size={16} className="text-blue-600" />
            <h2 className="text-sm font-semibold">Campaigns</h2>
          </div>

          {orderedCampaigns.map((c) => (
            <div
              key={c.id}
              onClick={() => setSelectedCampaignId(c.id)}
              className={`mb-2 cursor-pointer rounded-md border px-3 py-2 ${
                selectedCampaignId === c.id
                  ? "border-blue-600 bg-blue-50"
                  : "hover:bg-slate-50"
              }`}
            >
              <div className="text-sm font-medium">{c.name}</div>
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                <Clock size={12} />
                {c.status}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT */}
      <div className="flex-1 rounded-lg border bg-white p-4">
        {!selectedCampaignId ? (
          <div className="h-full flex items-center justify-center text-slate-500">
            Select a campaign
          </div>
        ) : (
          <>
            <div className="mb-3 flex justify-between items-center border-b pb-2">
              <h2 className="font-semibold">
                {campaigns.find((c) => c.id === selectedCampaignId)?.name}
              </h2>

              {campaigns.find((c) => c.id === selectedCampaignId)?.status ===
                "draft" && (
                <button
                  onClick={() => onLaunch(selectedCampaignId)}
                  disabled={launchingId === selectedCampaignId}
                  className="flex items-center gap-2 rounded-md bg-green-600 px-3 py-1.5 text-sm text-white"
                >
                  <Play size={14} />
                  Launch Now
                </button>
              )}
            </div>

            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-2 py-1 text-left">Phone</th>
                  <th className="px-2 py-1 text-left">Status</th>
                  <th className="px-2 py-1 text-left">Error</th>
                </tr>
              </thead>
              <tbody>
                {(messages[selectedCampaignId] ?? []).map((m) => (
                  <tr key={m.id} className="border-b">
                    <td className="px-2 py-1 font-mono">{m.phone}</td>
                    <td className="px-2 py-1">{m.status}</td>
                    <td className="px-2 py-1 text-red-600">{m.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
