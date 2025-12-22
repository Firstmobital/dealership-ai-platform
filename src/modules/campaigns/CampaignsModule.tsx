///Users/air/dealership-ai-platform/src/modules/campaigns/CampaignsModule.tsx
import {
  Megaphone,
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

type CampaignPageMode = "view" | "create";

/* ========================================================================
   CSV HELPERS
========================================================================= */
function parseSimpleCsv(raw: string) {
  const rows = raw.trim().split("\n").map((r) => r.split(","));
  const headers = rows[0] || [];
  const dataRows = rows.slice(1);
  return { headers, rows: dataRows };
}

function mapCsvRowsToObjects(
  headers: string[],
  rows: string[][],
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
  return Array.from(
    new Set(matches.map((m) => Number(m.replace(/[^\d]/g, "")))),
  ).sort();
}

function renderTemplatePreview(
  body: string,
  sample: Record<string, string>,
) {
  let out = String(body ?? "");
  const keys = Object.keys(sample ?? {});
  extractPlaceholders(out).forEach((n, idx) => {
    const val = keys[idx] ? sample[keys[idx]] : "";
    out = out.replace(new RegExp(`{{\\s*${n}\\s*}}`, "g"), val || `{{${n}}}`);
  });
  return out;
}

function WhatsAppPreviewCard(props: {
  body: string;
  header?: string | null;
  footer?: string | null;
}) {
  return (
    <div className="rounded-xl border bg-slate-50 p-4">
      <div className="mb-2 text-xs font-semibold text-slate-600">
        WhatsApp Preview
      </div>

      <div className="max-w-[420px] rounded-2xl bg-white p-3 shadow-sm">
        {props.header && (
          <div className="mb-2 text-sm font-semibold">
            {props.header}
          </div>
        )}

        <div className="whitespace-pre-wrap text-sm">
          {props.body}
        </div>

        {props.footer && (
          <div className="mt-2 text-xs text-slate-500">
            {props.footer}
          </div>
        )}
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
  } = useWhatsappTemplateStore();

  const { currentOrganization } = useOrganizationStore();
  const { activeSubOrg } = useSubOrganizationStore();

  const [mode, setMode] = useState<CampaignPageMode>("view");
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
      errors.push("CSV must include phone column");
    }

    setParsedRows(mapCsvRowsToObjects(parsed.headers, parsed.rows));
    setCsvErrors(errors);
  }, [csvText]);

  /* --------------------------------------------------------------------
     DERIVED
  -------------------------------------------------------------------- */
  const selectedCampaign = useMemo(
    () => campaigns.find((c) => c.id === selectedCampaignId) ?? null,
    [campaigns, selectedCampaignId],
  );

  const selectedTemplate = useMemo(
    () =>
      templates.find((t) => t.id === builder.whatsapp_template_id) ??
      null,
    [builder.whatsapp_template_id, templates],
  );

  const previewBody = useMemo(() => {
    if (mode === "view" && selectedCampaign) {
      return selectedCampaign.template_body;
    }
    if (mode === "create" && selectedTemplate) {
      return renderTemplatePreview(
        selectedTemplate.body,
        parsedRows[0]?.variables ?? {},
      );
    }
    return "";
  }, [mode, selectedCampaign, selectedTemplate, parsedRows]);

  /* =====================================================================
     UI
  ===================================================================== */
  return (
    <div className="flex h-full w-full gap-6 px-6 py-6">
      {/* LEFT */}
      <div className="w-[420px] flex flex-col gap-4">
        <div className="flex justify-end">
          <button
            onClick={() => {
              setMode("create");
              setSelectedCampaignId(null);
            }}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm text-white"
          >
            <PlusCircle size={16} />
            New Campaign
          </button>
        </div>

        {mode === "create" && (
          <div className="rounded-lg border bg-white p-4">
            <input
              className="mb-2 w-full border px-3 py-2 text-sm"
              placeholder="Campaign name"
              value={builder.name}
              onChange={(e) =>
                setBuilder((p) => ({ ...p, name: e.target.value }))
              }
            />

            <select
              className="mb-2 w-full border px-3 py-2 text-sm"
              value={builder.whatsapp_template_id}
              onChange={(e) =>
                setBuilder((p) => ({
                  ...p,
                  whatsapp_template_id: e.target.value,
                }))
              }
            >
              <option value="">Select Template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>

            <textarea
              className="w-full border px-3 py-2 text-xs"
              rows={4}
              placeholder="Paste CSV"
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
            />
          </div>
        )}

        <div className="flex-1 rounded-lg border bg-white p-4 overflow-y-auto">
          <h2 className="mb-2 text-sm font-semibold">Campaigns</h2>

          {loading ? (
            <div>Loading…</div>
          ) : (
            campaigns.map((c) => (
              <div
                key={c.id}
                onClick={() => {
                  setSelectedCampaignId(c.id);
                  setMode("view");
                }}
                className={`mb-2 cursor-pointer rounded-md border px-3 py-2 ${
                  selectedCampaignId === c.id
                    ? "border-blue-600 bg-blue-50"
                    : "hover:bg-slate-50"
                }`}
              >
                <div className="text-sm font-medium">{c.name}</div>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <Clock size={12} /> {c.status}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* RIGHT */}
      <div className="flex-1 flex flex-col gap-4">
        {previewBody ? (
          <WhatsAppPreviewCard body={previewBody} />
        ) : (
          <div className="rounded-lg border p-4 text-sm text-slate-500">
            Select a campaign or template to preview
          </div>
        )}

        {mode === "view" && selectedCampaign && (
          <div className="flex-1 rounded-lg border bg-white p-4">
            <div className="mb-2 font-semibold">
              {selectedCampaign.name}
            </div>

            {selectedCampaign.status === "draft" && (
              <button
                onClick={() => launchCampaign(selectedCampaign.id)}
                className="flex items-center gap-2 rounded-md bg-green-600 px-3 py-2 text-sm text-white"
              >
                <Play size={14} />
                Launch Now
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
