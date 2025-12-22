import {
  Megaphone,
  PlusCircle,
  Clock,
  Loader2,
  X,
  Send,
  Play,
  Save,
  RefreshCcw,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useCampaignStore } from "../../state/useCampaignStore";
import { useWhatsappTemplateStore } from "../../state/useWhatsappTemplateStore";
import { useOrganizationStore } from "../../state/useOrganizationStore";
import { useSubOrganizationStore } from "../../state/useSubOrganizationStore";
import { supabase } from "../../lib/supabaseClient";

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

type Mode = "view" | "create";

/* ========================================================================
   CSV HELPERS
========================================================================= */
function parseSimpleCsv(raw: string) {
  const rows = raw.trim().split("\n").map((r) => r.split(","));
  const headers = (rows[0] || []).map((h) => String(h ?? "").trim());
  return { headers, rows: rows.slice(1) };
}

function mapCsvRowsToObjects(headers: string[], rows: string[][]) {
  return rows
    .map((cols) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => (obj[h] = String(cols[i] ?? "").trim()));
      const phone = obj.phone;
      delete obj.phone;
      return phone ? { phone, variables: obj } : null;
    })
    .filter(Boolean) as ParsedCsvRow[];
}

/* ========================================================================
   TEMPLATE PREVIEW HELPERS
========================================================================= */
function renderTemplatePreview(
  body: string,
  vars: Record<string, string>
) {
  let out = String(body ?? "");
  Object.values(vars ?? {}).forEach((v, i) => {
    out = out.replace(new RegExp(`{{\\s*${i + 1}\\s*}}`, "g"), v || `{{${i + 1}}}`);
  });
  return out;
}

/* ========================================================================
   PREVIEW CARD
========================================================================= */
function WhatsAppPreviewCard({
  title,
  body,
}: {
  title?: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-2 flex justify-between">
        <div className="font-semibold">{title}</div>
        <div className="text-xs text-slate-500">WhatsApp</div>
      </div>

      <div className="rounded-2xl bg-slate-50 p-4">
        <div className="max-w-[520px] rounded-2xl bg-white p-3 shadow-sm whitespace-pre-wrap text-sm">
          {body || "(no content)"}
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
    retryFailedMessages,
  } = useCampaignStore();

  const { templates, fetchApprovedTemplates } = useWhatsappTemplateStore();
  const { currentOrganization } = useOrganizationStore();
  const { activeSubOrg } = useSubOrganizationStore();

  const [mode, setMode] = useState<Mode>("view");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  const [builder, setBuilder] = useState<BuilderState>({
    name: "",
    description: "",
    whatsapp_template_id: "",
  });

  const [csvText, setCsvText] = useState("");
  const [parsedRows, setParsedRows] = useState<ParsedCsvRow[]>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [testPhone, setTestPhone] = useState("");
  const [busy, setBusy] = useState(false);

  /* ---------------------------------------------------------
     LOAD
  --------------------------------------------------------- */
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

  /* ---------------------------------------------------------
     CSV PARSE
  --------------------------------------------------------- */
  useEffect(() => {
    if (!csvText.trim()) {
      setParsedRows([]);
      setCsvErrors([]);
      return;
    }

    const { headers, rows } = parseSimpleCsv(csvText);
    const errors = [];

    if (!headers.includes("phone")) errors.push("CSV must include phone column");

    const mapped = mapCsvRowsToObjects(headers, rows);
    if (!mapped.length) errors.push("No valid rows");

    setParsedRows(mapped);
    setCsvErrors(errors);
  }, [csvText]);

  /* ---------------------------------------------------------
     DERIVED
  --------------------------------------------------------- */
  const selectedCampaign = useMemo(
    () => campaigns.find((c) => c.id === selectedCampaignId) ?? null,
    [campaigns, selectedCampaignId]
  );

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === builder.whatsapp_template_id) ?? null,
    [templates, builder.whatsapp_template_id]
  );

  const previewBody =
    mode === "create"
      ? renderTemplatePreview(
          selectedTemplate?.body ?? "",
          parsedRows[0]?.variables ?? {}
        )
      : selectedCampaign?.template_body ?? "";

  const selectedMsgs = selectedCampaign
    ? messages[selectedCampaign.id] ?? []
    : [];

  const failedCount = selectedMsgs.filter((m) => m.status === "failed").length;

  /* ---------------------------------------------------------
     ACTIONS
  --------------------------------------------------------- */
  async function saveDraft() {
    if (!currentOrganization?.id) return;
    if (!builder.name || !builder.whatsapp_template_id || csvErrors.length) return;

    setBusy(true);
    try {
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
      setMode("view");
    } finally {
      setBusy(false);
    }
  }

  async function launchNow() {
    setBusy(true);
    try {
      await saveDraft();
      if (selectedCampaignId) await launchCampaign(selectedCampaignId);
    } finally {
      setBusy(false);
    }
  }

  async function testSend() {
    if (!testPhone || !previewBody) return;

    setBusy(true);
    try {
      const session = await supabase.auth.getSession();
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-test-send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.data.session?.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            organization_id: currentOrganization?.id,
            sub_organization_id: activeSubOrg?.id ?? null,
            to: testPhone,
            text: previewBody,
          }),
        }
      );
      alert("✅ Test sent");
    } finally {
      setBusy(false);
    }
  }

  /* =====================================================================
     UI
  ===================================================================== */
  return (
    <div className="flex h-full gap-6 p-6">
      {/* LEFT */}
      <div className="w-[360px] rounded-xl border bg-white p-4">
        <div className="mb-3 flex justify-between">
          <div className="flex gap-2 font-semibold">
            <Megaphone size={16} /> Campaigns
          </div>
          <button
            onClick={() => setMode("create")}
            className="text-blue-600 text-sm flex gap-1"
          >
            <PlusCircle size={14} /> New
          </button>
        </div>

        {loading ? (
          <Loader2 className="animate-spin" />
        ) : (
          campaigns.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setSelectedCampaignId(c.id);
                setMode("view");
              }}
              className={`w-full mb-2 rounded-md border p-2 text-left ${
                selectedCampaignId === c.id
                  ? "bg-blue-50 border-blue-600"
                  : ""
              }`}
            >
              <div className="flex justify-between">
                <div>{c.name}</div>
                <div className="text-xs flex gap-1">
                  <Clock size={12} /> {c.status}
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {/* RIGHT */}
      <div className="flex-1 flex flex-col gap-4">
        <WhatsAppPreviewCard
          title={
            mode === "create"
              ? "Template Preview"
              : `Preview: ${selectedCampaign?.name ?? ""}`
          }
          body={previewBody}
        />

        {mode === "create" ? (
          <div className="flex gap-2">
            <button onClick={launchNow} className="btn-green">
              <Play size={14} /> Launch
            </button>
            <button onClick={saveDraft} className="btn-outline">
              <Save size={14} /> Draft
            </button>
            <button onClick={testSend} className="btn-blue">
              <Send size={14} /> Test
            </button>
            <button onClick={() => setMode("view")} className="btn-outline">
              <X size={14} /> Cancel
            </button>
          </div>
        ) : (
          failedCount > 0 && (
            <button
              onClick={() => retryFailedMessages(selectedCampaign!.id)}
              className="btn-outline flex gap-2 w-fit"
            >
              <RefreshCcw size={14} /> Retry Failed ({failedCount})
            </button>
          )
        )}
      </div>
    </div>
  );
}
