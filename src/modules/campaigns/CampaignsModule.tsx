///Users/air/dealership-ai-platform/src/modules/campaigns/CampaignsModule.tsx
import { Megaphone, Play, PlusCircle, Clock, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useCampaignStore } from "../../state/useCampaignStore";
import { useWhatsappTemplateStore } from "../../state/useWhatsappTemplateStore";
import { useOrganizationStore } from "../../state/useOrganizationStore";
import { useSubOrganizationStore } from "../../state/useSubOrganizationStore";

/* ========================================================================
   TYPES
========================================================================= */
type ParsedCsvRow = {
  phone: string;
  variables: Record<string, string>;
};

type BuilderState = {
  name: string;
  description: string;
  whatsapp_template_id: string;
};

/* ========================================================================
   CSV HELPERS (simple + predictable)
========================================================================= */
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
    headers.forEach((h, i) => (obj[h] = cols[i]?.trim() ?? ""));
    const phone = obj["phone"] ?? "";
    delete obj["phone"];
    return { phone, variables: obj };
  });
}

/* ========================================================================
   PREVIEW HELPERS
========================================================================= */
function extractPlaceholders(body: string): number[] {
  const matches = body.match(/{{\s*(\d+)\s*}}/g) ?? [];
  const nums = matches
    .map((m) => Number(m.replace(/[^\d]/g, "")))
    .filter((n) => Number.isFinite(n));
  return Array.from(new Set(nums)).sort((a, b) => a - b);
}

function renderTemplatePreview(body: string, sample: Record<string, string>) {
  // Replace {{1}}, {{2}} using CSV headers (first row)
  // Mapping strategy:
  // - placeholder 1 -> first variable key
  // - placeholder 2 -> second variable key ...
  const keys = Object.keys(sample ?? {});
  let out = String(body ?? "");

  const placeholders = extractPlaceholders(out);
  placeholders.forEach((n, idx) => {
    const key = keys[idx];
    const val = key ? String(sample[key] ?? "").trim() : "";
    out = out.replace(new RegExp(`{{\\s*${n}\\s*}}`, "g"), val || `{{${n}}}`);
  });

  return out;
}

function WhatsAppPreviewCard(props: {
  header?: string | null;
  body: string;
  footer?: string | null;
}) {
  const { header, body, footer } = props;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-2 text-xs font-semibold text-slate-600">
        WhatsApp Preview
      </div>

      <div className="max-w-[420px] rounded-2xl bg-white p-3 shadow-sm">
        {header ? (
          <div className="mb-2 text-sm font-semibold text-slate-900">
            {header}
          </div>
        ) : null}

        <div className="whitespace-pre-wrap text-sm text-slate-900">
          {body}
        </div>

        {footer ? (
          <div className="mt-2 text-xs text-slate-500">{footer}</div>
        ) : null}

        <div className="mt-3 flex justify-end">
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
            WhatsApp
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========================================================================
   COMPONENT
========================================================================= */
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
    whatsapp_template_id: "",
  });

  const [csvText, setCsvText] = useState("");
  const [parsedRows, setParsedRows] = useState<ParsedCsvRow[]>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [launchingId, setLaunchingId] = useState<string | null>(null);

  /* --------------------------------------------------------------------
     LOAD DATA
  -------------------------------------------------------------------- */
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

  /* --------------------------------------------------------------------
     CSV PARSE
  -------------------------------------------------------------------- */
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

  /* --------------------------------------------------------------------
     TEMPLATE PREVIEW (Joyz-style)
  -------------------------------------------------------------------- */
  const selectedTemplate = useMemo(() => {
    if (!builder.whatsapp_template_id) return null;
    return templates.find((t) => t.id === builder.whatsapp_template_id) ?? null;
  }, [builder.whatsapp_template_id, templates]);

  const sampleVars = useMemo(() => {
    // Use first parsed row as sample variables for preview
    return parsedRows[0]?.variables ?? {};
  }, [parsedRows]);

  const previewBody = useMemo(() => {
    const body = String(selectedTemplate?.body ?? "").trim();
    if (!body) return "";
    return renderTemplatePreview(body, sampleVars);
  }, [selectedTemplate?.body, sampleVars]);

  /* --------------------------------------------------------------------
     CREATE CAMPAIGN (DRAFT)
  -------------------------------------------------------------------- */
  async function onCreateCampaign() {
    if (!currentOrganization?.id) return;

    if (!builder.name || !builder.whatsapp_template_id) {
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
        whatsapp_template_id: builder.whatsapp_template_id,
        scheduledAt: null,
        rows: parsedRows,
      });

      setSelectedCampaignId(id);
      setBuilder({ name: "", description: "", whatsapp_template_id: "" });
      setCsvText("");
    } catch (e: any) {
      alert(e?.message ?? "Failed to create campaign");
      console.error("[CampaignsModule] create draft error", e);
    } finally {
      setCreating(false);
    }
  }

  /* --------------------------------------------------------------------
     LAUNCH CAMPAIGN
  -------------------------------------------------------------------- */
  async function onLaunch(campaignId: string) {
    if (!confirm("This will start sending WhatsApp messages immediately.")) {
      return;
    }

    try {
      setLaunchingId(campaignId);
      await launchCampaign(campaignId);
    } catch (e: any) {
      alert(e?.message ?? "Failed to launch campaign");
      console.error("[CampaignsModule] launch error", e);
    } finally {
      setLaunchingId(null);
    }
  }

  /* --------------------------------------------------------------------
     ORDER: SUB-ORG FIRST
  -------------------------------------------------------------------- */
  const orderedCampaigns = useMemo(() => {
    if (!activeSubOrg) return campaigns;

    return [...campaigns].sort((a, b) => {
      const aLocal = a.sub_organization_id === activeSubOrg.id;
      const bLocal = b.sub_organization_id === activeSubOrg.id;
      return aLocal === bLocal ? 0 : aLocal ? -1 : 1;
    });
  }, [campaigns, activeSubOrg]);

  const selectedCampaign = useMemo(() => {
    if (!selectedCampaignId) return null;
    return campaigns.find((c) => c.id === selectedCampaignId) ?? null;
  }, [campaigns, selectedCampaignId]);

  /* =====================================================================
     UI
  ===================================================================== */
  return (
    <div className="flex h-full w-full gap-6 px-6 py-6">
      {/* LEFT */}
      <div className="w-[420px] flex flex-col gap-4">
        {/* BUILDER */}
        <div className="rounded-lg border bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <PlusCircle size={16} className="text-blue-600" />
            <h2 className="text-sm font-semibold">New Campaign</h2>
          </div>

          <input
            className="mb-2 w-full rounded-md border px-3 py-2 text-sm"
            placeholder="Campaign name"
            value={builder.name}
            onChange={(e) =>
              setBuilder((p) => ({ ...p, name: e.target.value }))
            }
          />

          <textarea
            className="mb-2 w-full rounded-md border px-3 py-2 text-sm"
            rows={2}
            placeholder="Description (optional)"
            value={builder.description}
            onChange={(e) =>
              setBuilder((p) => ({ ...p, description: e.target.value }))
            }
          />

          <select
            className="mb-2 w-full rounded-md border px-3 py-2 text-sm"
            value={builder.whatsapp_template_id}
            onChange={(e) =>
              setBuilder((p) => ({
                ...p,
                whatsapp_template_id: e.target.value,
              }))
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

          {selectedTemplate && (
            <div className="mb-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Selected: <span className="font-semibold">{selectedTemplate.name}</span>{" "}
              • {selectedTemplate.language} • {selectedTemplate.category}
            </div>
          )}

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
              <Loader2 size={16} className="mx-auto animate-spin" />
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

          {loading ? (
            <div className="text-sm text-slate-500">Loading…</div>
          ) : orderedCampaigns.length === 0 ? (
            <div className="text-sm text-slate-500">No campaigns yet.</div>
          ) : (
            orderedCampaigns.map((c) => (
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
                <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                  <div className="flex items-center gap-2">
                    <Clock size={12} />
                    {c.status}
                  </div>
                  <div>
                    {c.sent_count ?? 0}/{c.total_recipients ?? 0} sent
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* RIGHT */}
      <div className="flex-1 flex flex-col gap-4">
        {/* Preview Panel (Joyz-style) */}
        {selectedTemplate ? (
          <WhatsAppPreviewCard
            header={selectedTemplate.header_type === "TEXT" ? (selectedTemplate.header_text ?? "") : null}
            body={previewBody || String(selectedTemplate.body ?? "") || "(no body)"}
            footer={selectedTemplate.footer ?? null}
          />
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            Select an approved template to see WhatsApp preview.
          </div>
        )}

        {/* Campaign Details / Analytics */}
        <div className="flex-1 rounded-lg border bg-white p-4 overflow-auto">
          {!selectedCampaign ? (
            <div className="flex h-full items-center justify-center text-slate-500">
              Select a campaign to view analytics
            </div>
          ) : (
            <>
              <div className="mb-3 flex justify-between items-center border-b pb-2">
                <div>
                  <h2 className="font-semibold">{selectedCampaign.name}</h2>
                  <div className="mt-1 text-xs text-slate-500">
                    Status: <span className="font-medium">{selectedCampaign.status}</span>
                  </div>
                </div>

                {selectedCampaign.status === "draft" && (
                  <button
                    onClick={() => onLaunch(selectedCampaign.id)}
                    disabled={launchingId === selectedCampaign.id}
                    className="flex items-center gap-2 rounded-md bg-green-600 px-3 py-1.5 text-sm text-white disabled:opacity-60"
                  >
                    <Play size={14} />
                    {launchingId === selectedCampaign.id ? "Launching…" : "Launch Now"}
                  </button>
                )}
              </div>

              {/* Joyz-like summary cards */}
              <div className="mb-4 grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">Audience</div>
                  <div className="mt-1 text-lg font-semibold">
                    {selectedCampaign.total_recipients ?? 0}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">Sent</div>
                  <div className="mt-1 text-lg font-semibold">
                    {selectedCampaign.sent_count ?? 0}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">Failed</div>
                  <div className="mt-1 text-lg font-semibold text-red-600">
                    {selectedCampaign.failed_count ?? 0}
                  </div>
                </div>
              </div>

              {/* Messages table */}
              <div className="mb-2 text-sm font-semibold text-slate-800">
                Messages
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
                  {(messages[selectedCampaign.id] ?? []).map((m) => (
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
    </div>
  );
}
