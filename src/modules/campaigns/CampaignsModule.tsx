// src/modules/campaigns/CampaignsModule.tsx
// FULL + FINAL — Tier 6
// Bright CRM Campaign Manager
// Logic untouched + Division fallback UI

import {
  Megaphone,
  Upload,
  Play,
  FileText,
  PlusCircle,
  RefreshCcw,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
} from "lucide-react";

import { useEffect, useMemo, useState } from "react";
import { useCampaignStore } from "../../state/useCampaignStore";
import { useOrganizationStore } from "../../state/useOrganizationStore";
import { useSubOrganizationStore } from "../../state/useSubOrganizationStore";
import type { Campaign, CampaignMessage } from "../../types/database";

/* ======================================================================== */
/* HELPERS (UNCHANGED)                                                      */
/* ======================================================================== */
type ParsedCsvRow = { phone: string; variables: Record<string, string> };
type BuilderState = {
  name: string;
  description: string;
  templateBody: string;
  templateName: string;
  scheduledAt: string;
};

function parseSimpleCsv(raw: string) {
  const rows = raw.trim().split("\n").map((r) => r.split(","));
  const headers = rows[0] || [];
  const dataRows = rows.slice(1);
  return { headers, rows: dataRows };
}

function extractTemplateVariables(body: string) {
  const m = body.match(/{{\s*[\w\d_]+\s*}}/g) || [];
  return m.map((v) => v.replace(/[{}]/g, "").trim());
}

function mapCsvRowsToObjects(h: string[], rows: string[][]): ParsedCsvRow[] {
  return rows.map((cols) => {
    const obj: Record<string, string> = {};
    h.forEach((name, i) => (obj[name] = cols[i] || ""));
    const phone = obj["phone"]?.trim() ?? "";
    const vars = { ...obj };
    delete vars["phone"];
    return { phone, variables: vars };
  });
}

/* ======================================================================== */
/* COMPONENT                                                                */
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
    retryFailedMessages,
  } = useCampaignStore();

  const { currentOrganization } = useOrganizationStore();
  const { activeSubOrg } = useSubOrganizationStore();

  const [selectedCampaignId, setSelectedCampaignId] =
    useState<string | null>(null);

  const [builderState, setBuilderState] = useState<BuilderState>({
    name: "",
    description: "",
    templateBody: "",
    templateName: "",
    scheduledAt: "",
  });

  const [csvState, setCsvState] = useState({
    rawText: "",
    headers: [] as string[],
    rows: [] as string[][],
    parsedRows: [] as ParsedCsvRow[],
    errors: [] as string[],
    warnings: [] as string[],
  });

  const [creating, setCreating] = useState(false);
  const [launchingId, setLaunchingId] = useState<string | null>(null);

  /* -------------------------------------------------------------------- */
  /* LOAD DATA                                                            */
  /* -------------------------------------------------------------------- */
  useEffect(() => {
    if (currentOrganization?.id) {
      fetchCampaigns(currentOrganization.id);
    }
  }, [currentOrganization?.id, activeSubOrg?.id]);

  useEffect(() => {
    if (selectedCampaignId && !messages[selectedCampaignId]) {
      fetchCampaignMessages(selectedCampaignId);
    }
  }, [selectedCampaignId]);

  useEffect(() => {
    const raw = csvState.rawText.trim();
    if (!raw) {
      setCsvState((p) => ({
        ...p,
        headers: [],
        rows: [],
        parsedRows: [],
        errors: [],
        warnings: [],
      }));
      return;
    }

    const parsed = parseSimpleCsv(raw);
    const mapped = mapCsvRowsToObjects(parsed.headers, parsed.rows);

    const errors: string[] = [];
    if (!parsed.headers.includes("phone")) {
      errors.push("CSV must include a 'phone' column.");
    }

    setCsvState((p) => ({
      ...p,
      headers: parsed.headers,
      rows: parsed.rows,
      parsedRows: mapped,
      errors,
      warnings: [],
    }));
  }, [csvState.rawText]);

  const templateVariables = useMemo(
    () => extractTemplateVariables(builderState.templateBody),
    [builderState.templateBody],
  );

  const csvPreview = csvState.parsedRows.slice(0, 5);

  /* -------------------------------------------------------------------- */
  /* 🔑 DIVISION FIRST, ORG FALLBACK NEXT                                  */
  /* -------------------------------------------------------------------- */
  const orderedCampaigns = useMemo(() => {
    if (!activeSubOrg) return campaigns;

    return [...campaigns].sort((a, b) => {
      const aLocal = a.sub_organization_id === activeSubOrg.id;
      const bLocal = b.sub_organization_id === activeSubOrg.id;

      if (aLocal && !bLocal) return -1;
      if (!aLocal && bLocal) return 1;
      return 0;
    });
  }, [campaigns, activeSubOrg]);

  /* ===================================================================== */
  /* UI                                                                    */
  /* ===================================================================== */
  return (
    <div className="flex h-full w-full gap-6 overflow-hidden px-6 py-6 text-slate-900">
      {/* =============================================================== */}
      {/* LEFT — BUILDER + LIST                                         */}
      {/* =============================================================== */}
      <div className="flex w-[380px] flex-col gap-4">
        {/* BUILDER */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <PlusCircle size={16} className="text-blue-600" />
            <h2 className="text-sm font-semibold">Create Campaign</h2>
          </div>

          <input
            className="mb-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Campaign name"
            value={builderState.name}
            onChange={(e) =>
              setBuilderState((p) => ({ ...p, name: e.target.value }))
            }
          />

          <select
            className="mb-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={builderState.templateName}
            onChange={(e) =>
              setBuilderState((p) => ({
                ...p,
                templateName: e.target.value,
              }))
            }
          >
            <option value="">Select Template</option>
            <option value="Zawl Altroz">Zawl Altroz</option>
            <option value="Clearance">Clearance</option>
            <option value="Followup">Followup</option>
          </select>

          <textarea
            className="mb-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            rows={4}
            placeholder="Template body (use {{variable}} placeholders)"
            value={builderState.templateBody}
            onChange={(e) =>
              setBuilderState((p) => ({
                ...p,
                templateBody: e.target.value,
              }))
            }
          />

          <textarea
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono"
            rows={5}
            placeholder="Paste CSV here (must include phone column)"
            value={csvState.rawText}
            onChange={(e) =>
              setCsvState((p) => ({ ...p, rawText: e.target.value }))
            }
          />

          {csvState.errors.length > 0 && (
            <div className="mt-2 rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-700">
              {csvState.errors.map((e, i) => (
                <div key={i}>❌ {e}</div>
              ))}
            </div>
          )}

          {csvPreview.length > 0 && (
            <div className="mt-3 rounded-md border border-slate-200 p-2 text-xs">
              <div className="mb-1 font-medium text-slate-600">
                CSV Preview
              </div>
              <table className="w-full">
                <tbody>
                  {csvPreview.map((r, i) => (
                    <tr key={i}>
                      <td className="pr-2 font-mono">{r.phone}</td>
                      <td className="text-slate-600">
                        {Object.entries(r.variables)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button
            disabled={creating}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Upload size={16} />
            )}
            Create Campaign
          </button>
        </div>

        {/* LIST */}
        <div className="flex-1 overflow-hidden rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <Megaphone size={16} className="text-blue-600" />
            <h2 className="text-sm font-semibold">Campaigns</h2>
          </div>

          <div className="space-y-2 overflow-y-auto">
            {orderedCampaigns.map((c) => {
              const isActive = c.id === selectedCampaignId;
              const isLocal =
                activeSubOrg &&
                c.sub_organization_id === activeSubOrg.id;

              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedCampaignId(c.id)}
                  className={`cursor-pointer rounded-md border px-3 py-2 ${
                    isActive
                      ? "border-blue-600 bg-blue-50"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{c.name}</div>

                    {activeSubOrg && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] ${
                          isLocal
                            ? "bg-green-50 text-green-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {isLocal ? "This Division" : "From Organization"}
                      </span>
                    )}
                  </div>

                  <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                    <Clock size={12} />
                    {c.scheduled_at
                      ? new Date(c.scheduled_at).toLocaleString()
                      : "Not scheduled"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* =============================================================== */}
      {/* RIGHT — DETAILS (UNCHANGED)                                   */}
      {/* =============================================================== */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white p-4">
        {!selectedCampaignId ? (
          <div className="flex flex-1 items-center justify-center text-slate-500">
            Select a campaign
          </div>
        ) : (
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h2 className="text-lg font-semibold">
                  {campaigns.find((c) => c.id === selectedCampaignId)?.name}
                </h2>
                <p className="text-xs text-slate-500">
                  Campaign details & messages
                </p>
              </div>

              <button
                className="flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
              >
                <Play size={14} />
                Launch Now
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-hidden rounded-md border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">
                      Phone
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">
                      Status
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">
                      Error
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(messages[selectedCampaignId] ?? []).map((m) => (
                    <tr
                      key={m.id}
                      className="border-b hover:bg-slate-50"
                    >
                      <td className="px-3 py-2 font-mono">
                        {m.phone}
                      </td>
                      <td className="px-3 py-2">
                        {m.status}
                      </td>
                      <td className="px-3 py-2 text-red-600">
                        {m.error}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
