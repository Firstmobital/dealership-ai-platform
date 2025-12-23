// /Users/air/dealership-ai-platform/src/modules/campaigns/CampaignsModule.tsx
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
  const rows = raw
    .trim()
    .split("\n")
    .map((r) => r.split(","));
  const headers = (rows[0] || []).map((h) => String(h ?? "").trim());
  return { headers, rows: rows.slice(1) };
}

function mapCsvRowsToObjects(
  headers: string[],
  rows: string[][]
): ParsedCsvRow[] {
  return rows
    .map((cols) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => (obj[h] = String(cols[i] ?? "").trim()));
      const phone = String(obj.phone ?? "").trim();
      delete obj.phone;
      return phone ? { phone, variables: obj } : null;
    })
    .filter(Boolean) as ParsedCsvRow[];
}

/* ========================================================================
   TEMPLATE PREVIEW
========================================================================= */
function renderTemplatePreview(body: string, vars: Record<string, string>) {
  let out = String(body ?? "");
  Object.values(vars ?? {}).forEach((v, i) => {
    out = out.replace(
      new RegExp(`{{\\s*${i + 1}\\s*}}`, "g"),
      v || `{{${i + 1}}}`
    );
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
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex justify-between">
        <div className="text-sm font-semibold">{title}</div>
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
    retryFailedMessages, // ✅ FIX: was missing in your version
  } = useCampaignStore();

  const {
    templates,
    fetchApprovedTemplates,
    loading: templatesLoading,
  } = useWhatsappTemplateStore();

  const { currentOrganization } = useOrganizationStore();
  const { activeSubOrg } = useSubOrganizationStore();

  const [mode, setMode] = useState<Mode>("view");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(
    null
  );

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
  const [retrying, setRetrying] = useState(false);

  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaMime, setMediaMime] = useState<string | null>(null);

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

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === builder.whatsapp_template_id) ?? null,
    [templates, builder.whatsapp_template_id]
  );

  useEffect(() => {
    setMediaUrl(selectedTemplate?.header_media_url ?? null);
    setMediaMime(selectedTemplate?.header_media_mime ?? null);
  }, [builder.whatsapp_template_id, selectedTemplate]);
  
  /* --------------------------------------------------------------------
     CSV PARSE
  -------------------------------------------------------------------- */
  useEffect(() => {
    if (!csvText.trim()) {
      setParsedRows([]);
      setCsvErrors([]);
      return;
    }

    const { headers, rows } = parseSimpleCsv(csvText);
    const errors: string[] = [];

    if (!headers.includes("phone"))
      errors.push("CSV must include phone column");

    const mapped = mapCsvRowsToObjects(headers, rows);
    if (!mapped.length) errors.push("No valid rows");

    setParsedRows(mapped);
    setCsvErrors(errors);
  }, [csvText]);

  /* --------------------------------------------------------------------
     DERIVED
  -------------------------------------------------------------------- */
  const selectedCampaign = useMemo(
    () => campaigns.find((c) => c.id === selectedCampaignId) ?? null,
    [campaigns, selectedCampaignId]
  );

  const needsMedia =
    selectedTemplate?.header_type === "IMAGE" ||
    selectedTemplate?.header_type === "DOCUMENT";

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

  /* --------------------------------------------------------------------
     ANALYTICS (SAFE FALLBACK)
  -------------------------------------------------------------------- */
  const analytics = useMemo(() => {
    const total =
      selectedCampaign?.total_recipients ?? selectedMsgs.length ?? 0;

    let sent = selectedCampaign?.sent_count ?? 0;
    let failed = selectedCampaign?.failed_count ?? 0;
    let delivered = 0;
    let pending = Math.max(0, total - sent - failed);

    // Prefer live message list when loaded
    if (selectedMsgs.length > 0) {
      sent = failed = delivered = pending = 0;
      for (const m of selectedMsgs) {
        if (m.status === "delivered") delivered++;
        else if (m.status === "failed") failed++;
        else if (m.status === "sent") sent++;
        else pending++;
      }
    }

    return { total, sent, delivered, failed, pending };
  }, [
    selectedMsgs,
    selectedCampaign?.total_recipients,
    selectedCampaign?.sent_count,
    selectedCampaign?.failed_count,
  ]);

  /* --------------------------------------------------------------------
     ACTIONS
  -------------------------------------------------------------------- */
  function openCreate() {
    setMode("create");
    setBuilder({ name: "", description: "", whatsapp_template_id: "" });
    setCsvText("");
    setParsedRows([]);
    setCsvErrors([]);
    setTestPhone("");
  }

  function closeCreate() {
    setMode("view");
  }

  // ✅ FIX: return created campaign id (so launchNow can use it reliably)
  async function saveDraft(): Promise<string | null> {
    if (!currentOrganization?.id) {
      alert("No organization selected");
      return null;
    }

    if (!builder.name.trim() || !builder.whatsapp_template_id) {
      alert("Campaign name and template are required");
      return null;
    }

    if (csvErrors.length > 0 || parsedRows.length === 0) {
      alert("Fix CSV errors before saving");
      return null;
    }

    if (needsMedia && !mediaUrl) {
      alert("This template requires media. Please upload before continuing.");
      return null;
    }

    setBusy(true);
    try {
      const id = await createCampaignWithMessages({
        organizationId: currentOrganization.id,
        sub_organization_id: activeSubOrg?.id ?? null,
        name: builder.name.trim(),
        description: builder.description?.trim() ?? "",
        whatsapp_template_id: builder.whatsapp_template_id,
        scheduledAt: null, // draft
        rows: parsedRows,
      });

      setSelectedCampaignId(id);
      setMode("view");

      // keep list fresh
      await fetchCampaigns(currentOrganization.id);
      await fetchCampaignMessages(id);

      return id;
    } catch (e: any) {
      console.error("[CampaignsModule] saveDraft error", e);
      alert(e?.message ?? "Failed to save draft");
      return null;
    } finally {
      setBusy(false);
    }
  }

  // ✅ FIX: no race condition (launch uses returned id)
  async function launchNow() {
    const id = await saveDraft();
    if (!id) return;

    setBusy(true);
    try {
      await launchCampaign(id);
      await fetchCampaigns(currentOrganization!.id);
      await fetchCampaignMessages(id);
      alert("✅ Campaign scheduled (dispatch will pick it)");
    } catch (e: any) {
      console.error("[CampaignsModule] launchNow error", e);
      alert(e?.message ?? "Failed to launch campaign");
    } finally {
      setBusy(false);
    }
  }

  async function testSend() {
    if (!currentOrganization?.id) return;

    const phone = String(testPhone ?? "").trim();
    if (!phone) {
      alert("Enter a test phone number");
      return;
    }

    if (!previewBody.trim()) {
      alert("Preview is empty. Select a template first.");
      return;
    }

    setBusy(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) {
        alert("Not authenticated");
        return;
      }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-test-send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            organization_id: currentOrganization.id,
            sub_organization_id: activeSubOrg?.id ?? null,
            to: phone,
            text: previewBody,
          }),
        }
      );

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[CampaignsModule] testSend failed", json);
        alert(json?.error ?? "Test send failed");
        return;
      }

      alert("✅ Test message sent");
    } catch (e: any) {
      console.error("[CampaignsModule] testSend error", e);
      alert(e?.message ?? "Test send failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRetryFailed() {
    if (!currentOrganization?.id) return;
    if (!selectedCampaign?.id) return;

    setRetrying(true);
    try {
      await retryFailedMessages(selectedCampaign.id);
      await fetchCampaignMessages(selectedCampaign.id);
      await fetchCampaigns(currentOrganization.id);
      alert("✅ Failed messages moved back to pending");
    } catch (e: any) {
      console.error("[CampaignsModule] retry failed error", e);
      alert(e?.message ?? "Failed to retry messages");
    } finally {
      setRetrying(false);
    }
  }

  async function uploadTemplateMedia(file: File) {
    if (!currentOrganization?.id || !selectedTemplate?.id) {
      alert("Select template first");
      return;
    }

    const isImage = selectedTemplate.header_type === "IMAGE";
    const bucket = isImage
      ? "whatsapp-template-images"
      : "whatsapp-template-documents";

    const path = `${currentOrganization.id}/${selectedTemplate.id}/${file.name}`;

    setMediaUploading(true);
    try {
      const { error } = await supabase.storage
        .from(bucket)
        .upload(path, file, { upsert: true });

      if (error) throw error;

      const { data } = supabase.storage.from(bucket).getPublicUrl(path);

      await supabase
      .from("whatsapp_templates")
      .update({
        header_media_url: data.publicUrl,
        header_media_mime: file.type,
        updated_at: new Date().toISOString(),
      })
      .eq("id", selectedTemplate.id);

      setMediaUrl(data.publicUrl);
      setMediaMime(file.type);
    } catch (e: any) {
      console.error("[CampaignsModule] media upload failed", e);
      alert(e.message ?? "Media upload failed");
    } finally {
      setMediaUploading(false);
    }
  }

  /* =====================================================================
     UI
  ===================================================================== */
  return (
    <div className="flex h-[calc(100vh-64px)] gap-6 p-6">
      {/* LEFT */}
      <div className="w-[360px] rounded-xl border bg-white flex flex-col">
        {/* Header (fixed) */}
        <div className="p-4 border-b">
          <div className="flex justify-between">
            <div className="flex gap-2 font-semibold">
              <Megaphone size={16} /> Campaigns
            </div>
            <button
              onClick={openCreate}
              className="text-blue-600 text-sm flex gap-1"
            >
              <PlusCircle size={14} /> New
            </button>
          </div>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : campaigns.length === 0 ? (
            <div className="text-sm text-slate-500">No campaigns yet.</div>
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
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <div className="flex justify-between">
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs flex gap-1 text-slate-600">
                    <Clock size={12} /> {c.status}
                  </div>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {c.sent_count ?? 0}/{c.total_recipients ?? 0} sent
                </div>
              </button>
            ))
          )}
        </div>
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
          <div className="rounded-xl border bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">
                Create Campaign
              </div>
              <button
                onClick={closeCreate}
                className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-slate-50"
              >
                <X size={14} /> Close
              </button>
            </div>

            <input
              className="w-full border rounded-md px-3 py-2 text-sm"
              placeholder="Campaign name"
              value={builder.name}
              onChange={(e) =>
                setBuilder((p) => ({ ...p, name: e.target.value }))
              }
            />

            <textarea
              className="w-full border rounded-md px-3 py-2 text-sm"
              placeholder="Description (optional)"
              rows={2}
              value={builder.description}
              onChange={(e) =>
                setBuilder((p) => ({ ...p, description: e.target.value }))
              }
            />

            <select
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={builder.whatsapp_template_id}
              onChange={(e) =>
                setBuilder((p) => ({
                  ...p,
                  whatsapp_template_id: e.target.value,
                }))
              }
              disabled={templatesLoading || busy}
            >
              <option value="">
                {templatesLoading ? "Loading templates…" : "Select template"}
              </option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} • {t.category} • {t.header_type} • {t.language}
                </option>
              ))}
            </select>

            {needsMedia && (
              <div className="rounded-md border bg-slate-50 p-3 space-y-2">
                <div className="text-xs font-semibold text-slate-700">
                  Template requires{" "}
                  {selectedTemplate?.header_type === "IMAGE"
                    ? "Image"
                    : "Document"}
                </div>

                <input
                  type="file"
                  accept={
                    selectedTemplate?.header_type === "IMAGE"
                      ? "image/*"
                      : "application/pdf"
                  }
                  disabled={mediaUploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadTemplateMedia(file);
                  }}
                />

                {mediaUploading && (
                  <div className="text-xs text-slate-500">Uploading media…</div>
                )}

                {mediaUrl && (
                  <div className="text-xs text-green-700">
                    Media uploaded successfully
                  </div>
                )}
              </div>
            )}

            <textarea
              className="w-full border rounded-md px-3 py-2 text-xs font-mono"
              rows={6}
              placeholder={`phone,name,model\n919999888877,Ritesh,Nexon`}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              disabled={busy}
            />

            {/* ✅ FIX: show CSV errors */}
            {csvErrors.length > 0 && (
              <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                {csvErrors.map((e) => (
                  <div key={e}>❌ {e}</div>
                ))}
              </div>
            )}

            <input
              className="w-full border rounded-md px-3 py-2 text-sm"
              placeholder="Test phone (91XXXXXXXXXX)"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              disabled={busy}
            />

            <div className="flex flex-wrap gap-2">
              <button
                onClick={launchNow}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-md bg-green-600 text-white px-3 py-2 text-sm hover:bg-green-700 disabled:opacity-60"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play size={14} />
                )}
                Launch
              </button>

              <button
                onClick={saveDraft}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                Save Draft
              </button>

              <button
                onClick={testSend}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send size={14} />
                )}
                Test Send
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Analytics + Retry */}
            <div className="rounded-xl border bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">
                  Analytics
                </div>

                {selectedCampaign?.id && analytics.failed > 0 && (
                  <button
                    disabled={retrying}
                    onClick={onRetryFailed}
                    className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 hover:bg-red-100 disabled:opacity-60"
                  >
                    {retrying ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCcw size={14} />
                    )}
                    Retry Failed ({analytics.failed})
                  </button>
                )}
              </div>

              <div className="grid grid-cols-5 gap-3">
                {[
                  ["Audience", analytics.total],
                  ["Sent", analytics.sent],
                  ["Delivered", analytics.delivered],
                  ["Pending", analytics.pending],
                  ["Failed", analytics.failed],
                ].map(([label, val]) => (
                  <div
                    key={String(label)}
                    className={`p-3 rounded-md ${
                      label === "Failed"
                        ? "bg-red-50 border border-red-200"
                        : "bg-slate-50"
                    }`}
                  >
                    <div
                      className={`text-xs ${
                        label === "Failed" ? "text-red-700" : "text-slate-500"
                      }`}
                    >
                      {label}
                    </div>
                    <div
                      className={`text-lg font-semibold ${
                        label === "Failed" ? "text-red-700" : "text-slate-900"
                      }`}
                    >
                      {val as any}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Messages table (optional but helpful) */}
            <div className="flex-1 rounded-xl border bg-white p-4 overflow-auto">
              {!selectedCampaign ? (
                <div className="text-sm text-slate-500">
                  Select a campaign to view messages.
                </div>
              ) : (
                <>
                  <div className="mb-2 text-sm font-semibold text-slate-900">
                    Messages
                  </div>
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-2 py-2 text-left">Phone</th>
                        <th className="px-2 py-2 text-left">Status</th>
                        <th className="px-2 py-2 text-left">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedMsgs ?? []).map((m) => (
                        <tr key={m.id} className="border-b">
                          <td className="px-2 py-2 font-mono">{m.phone}</td>
                          <td className="px-2 py-2">{m.status}</td>
                          <td className="px-2 py-2 text-red-600">{m.error}</td>
                        </tr>
                      ))}
                      {selectedMsgs.length === 0 ? (
                        <tr>
                          <td className="px-2 py-6 text-slate-500" colSpan={3}>
                            No messages loaded yet.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
