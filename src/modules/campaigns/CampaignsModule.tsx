// — SAME IMPORTS —
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
/* CSV + template helpers (unchanged) */
/* ======================================================================== */
type ParsedCsvRow = { phone: string; variables: Record<string, string> };
type BuilderState = {
  name: string;
  description: string;
  templateBody: string;
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
/* COMPONENT: CampaignsModule */
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

  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  const [builderState, setBuilderState] = useState<BuilderState>({
    name: "",
    description: "",
    templateBody: "",
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
  /* Load campaigns whenever org/sub-org changes                          */
  /* -------------------------------------------------------------------- */
  useEffect(() => {
    if (currentOrganization?.id) {
      fetchCampaigns(currentOrganization.id);
    }
  }, [currentOrganization?.id, activeSubOrg?.id]);

  /* -------------------------------------------------------------------- */
  /* Auto-fetch messages for selected campaign                            */
  /* -------------------------------------------------------------------- */
  useEffect(() => {
    if (selectedCampaignId) {
      if (!messages[selectedCampaignId]) {
        fetchCampaignMessages(selectedCampaignId);
      }
    }
  }, [selectedCampaignId]);

  /* -------------------------------------------------------------------- */
  /* Parse CSV when raw changes                                           */
  /* -------------------------------------------------------------------- */
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

  /* -------------------------------------------------------------------- */
  /* Template variables                                                   */
  /* -------------------------------------------------------------------- */
  const templateVariables = useMemo(
    () => extractTemplateVariables(builderState.templateBody),
    [builderState.templateBody]
  );

  const csvPreview = csvState.parsedRows.slice(0, 5);

  /* -------------------------------------------------------------------- */
  /* CREATE CAMPAIGN                                                      */
  /* -------------------------------------------------------------------- */
  const handleCreateCampaign = async () => {
    if (!currentOrganization?.id) return alert("No organization selected.");


    setCreating(true);
    try {
      const newId = await createCampaignWithMessages({
        organizationId: currentOrganization.id,
        sub_organization_id: activeSubOrg?.id ?? null,      // ✅ ADD HERE
        name: builderState.name,
        description: builderState.description,
        templateBody: builderState.templateBody,
        templateVariables,
        scheduledAt: builderState.scheduledAt || null,
        rows: csvState.parsedRows,
      });
      
      if (newId) {
        setSelectedCampaignId(newId);
        await fetchCampaigns(currentOrganization.id);
        await fetchCampaignMessages(newId);
      }

      // Reset builder
      setBuilderState({
        name: "",
        description: "",
        templateBody: "",
        scheduledAt: "",
      });

      setCsvState({
        rawText: "",
        headers: [],
        rows: [],
        parsedRows: [],
        errors: [],
        warnings: [],
      });
    } catch (err) {
      console.error("createCampaign error:", err);
    } finally {
      setCreating(false);
    }
  };

  /* -------------------------------------------------------------------- */
  /* LAUNCH NOW                                                           */
  /* -------------------------------------------------------------------- */
  const handleLaunchNow = async (campaignId: string) => {
    if (!currentOrganization?.id) return;

    setLaunchingId(campaignId);
    try {
      await launchCampaign(campaignId, null);
      await fetchCampaigns(currentOrganization.id);
      if (selectedCampaignId === campaignId) {
        await fetchCampaignMessages(campaignId);
      }
    } catch (err) {
      console.error("launchCampaign error", err);
    } finally {
      setLaunchingId(null);
    }
  };

  /* -------------------------------------------------------------------- */
  /* RETRY FAILED                                                         */
  /* -------------------------------------------------------------------- */
  const handleRetryFailed = async () => {
    if (!selectedCampaignId) return;
    if (!currentOrganization?.id) return;

    try {
      await retryFailedMessages(selectedCampaignId);
      await fetchCampaignMessages(selectedCampaignId);
      await fetchCampaigns(currentOrganization.id);
    } catch (err) {
      console.error("retryFailed error", err);
    }
  };

  /* -------------------------------------------------------------------- */
  /* Active campaign + messages                                           */
  /* -------------------------------------------------------------------- */
  const activeCampaign: Campaign | null = selectedCampaignId
    ? campaigns.find((c) => c.id === selectedCampaignId) || null
    : null;

  const activeMessages: CampaignMessage[] = selectedCampaignId
    ? messages[selectedCampaignId] ?? []
    : [];

  /* ===================================================================== */
  /* UI (UNCHANGED BELOW EXCEPT FOR UPDATED CALLS ABOVE)                   */
  /* ===================================================================== */
    /* ===================================================================== */
    /*  UI                                                                   */
    /* ===================================================================== */
    return (
      <div className="flex h-full w-full gap-4 overflow-hidden p-4 text-white">
  
        {/* =============================================================== */}
        {/*  LEFT COLUMN — CAMPAIGN LIST + BUILDER                         */}
        {/* =============================================================== */}
        <div className="w-1/3 flex flex-col gap-4">
  
          {/* ---------------------- Campaign Builder ---------------------- */}
          <div className="rounded-xl bg-slate-900/60 backdrop-blur border border-white/10 p-4 shadow-xl">
            <div className="flex items-center gap-2 mb-3">
              <PlusCircle size={16} className="text-accent" />
              <h2 className="text-sm font-semibold">Create Campaign</h2>
            </div>
  
            <input
              type="text"
              className="w-full mb-2 rounded bg-slate-800 px-3 py-2 text-sm"
              placeholder="Campaign name"
              value={builderState.name}
              onChange={(e) =>
                setBuilderState((p) => ({ ...p, name: e.target.value }))
              }
            />
  
            <textarea
              className="w-full mb-2 rounded bg-slate-800 px-3 py-2 text-sm"
              placeholder="Template body (use {{variable}} placeholders)"
              rows={4}
              value={builderState.templateBody}
              onChange={(e) =>
                setBuilderState((p) => ({
                  ...p,
                  templateBody: e.target.value,
                }))
              }
            />
  
            <textarea
              className="w-full h-28 mt-2 rounded bg-slate-800 px-3 py-2 text-xs font-mono"
              placeholder="Paste CSV here (must include `phone` column)"
              value={csvState.rawText}
              onChange={(e) =>
                setCsvState((p) => ({ ...p, rawText: e.target.value }))
              }
            />
  
            {(csvState.errors.length > 0 || csvState.warnings.length > 0) && (
              <div className="mt-2 bg-red-900/30 border border-red-600/50 rounded p-2 text-xs">
                {csvState.errors.map((e, i) => (
                  <div key={i}>❌ {e}</div>
                ))}
                {csvState.warnings.map((w, i) => (
                  <div key={i} className="text-yellow-400">
                    ⚠️ {w}
                  </div>
                ))}
              </div>
            )}
  
            {/* Preview */}
            {csvPreview.length > 0 && (
              <div className="mt-3 rounded border border-white/10 p-2 text-xs">
                <div className="mb-1 font-semibold text-slate-300">
                  CSV Preview (first 5 rows)
                </div>
                <table className="w-full text-left text-xs">
                  <thead className="text-slate-400">
                    <tr>
                      {Object.keys(csvPreview[0]).map((k) => (
                        <th key={k} className="pr-2">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreview.map((row, idx) => (
                      <tr key={idx} className="odd:bg-slate-800/50">
                        <td className="pr-2">{row.phone}</td>
                        <td>
                          {Object.entries(row.variables)
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
              onClick={handleCreateCampaign}
              className="mt-3 flex items-center justify-center gap-2 bg-accent text-white w-full py-2 rounded-lg hover:bg-accent/90 disabled:opacity-50"
            >
              {creating ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              Create Campaign
            </button>
          </div>
  
          {/* ---------------------- Campaign List ---------------------- */}
          <div className="rounded-xl bg-slate-900/60 backdrop-blur border border-white/10 p-4 shadow-xl flex-1 overflow-hidden">
            <div className="flex items-center gap-2 mb-3">
              <Megaphone size={16} className="text-accent" />
              <h2 className="text-sm font-semibold">Campaigns</h2>
            </div>
  
            <div className="overflow-y-auto max-h-[calc(100vh-260px)] pr-2">
              {campaigns.map((c) => {
                const isActive = c.id === selectedCampaignId;
                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedCampaignId(c.id)}
                    className={`p-3 mb-2 rounded-lg cursor-pointer border ${
                      isActive
                        ? "border-accent bg-accent/20"
                        : "border-white/10 bg-slate-800/50 hover:bg-slate-800/70"
                    }`}
                  >
                    <div className="text-sm font-semibold">{c.name}</div>
                    <div className="text-xs text-slate-400">{c.description}</div>
                    <div className="flex gap-3 mt-2 text-xs">
                      <div className="flex items-center gap-1">
                        <Clock size={12} />
                        {c.scheduled_at
                          ? new Date(c.scheduled_at).toLocaleString()
                          : "Not scheduled"}
                      </div>
                      <div
                        className={`px-2 py-0.5 rounded ${
                          c.status === "completed"
                            ? "bg-green-800 text-green-300"
                            : c.status === "scheduled"
                            ? "bg-blue-800 text-blue-300"
                            : c.status === "sending"
                            ? "bg-yellow-800 text-yellow-300"
                            : "bg-slate-700 text-slate-300"
                        }`}
                      >
                        {c.status}
                      </div>
                    </div>
                  </div>
                );
              })}
  
              {campaigns.length === 0 && (
                <div className="text-center text-slate-500 text-sm py-10">
                  No campaigns yet.
                </div>
              )}
            </div>
          </div>
        </div>
  
        {/* =============================================================== */}
        {/*  RIGHT COLUMN — CAMPAIGN DETAILS                                */}
        {/* =============================================================== */}
        <div className="flex-1 rounded-xl bg-slate-900/60 backdrop-blur border border-white/10 p-4 shadow-xl overflow-hidden">
  
          {!activeCampaign ? (
            <div className="flex h-full items-center justify-center text-slate-500">
              Select a campaign
            </div>
          ) : (
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
                <div>
                  <h2 className="text-lg font-semibold">{activeCampaign.name}</h2>
                  <div className="text-xs text-slate-400">
                    {activeCampaign.description}
                  </div>
                </div>
  
                <button
                  className="flex items-center gap-2 px-3 py-1.5 bg-accent rounded-lg text-sm hover:bg-accent/90 disabled:opacity-50"
                  onClick={() => handleLaunchNow(activeCampaign.id)}
                  disabled={launchingId === activeCampaign.id}
                >
                  {launchingId === activeCampaign.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Play size={14} />
                  )}
                  Launch Now
                </button>
              </div>
  
              {/* Stats */}
              <div className="flex gap-4 mb-4">
                <div className="flex items-center gap-2 bg-slate-800/60 px-3 py-2 rounded">
                  <FileText size={14} />
                  <span className="text-xs">
                    Total: {activeCampaign.total_recipients ?? 0}
                  </span>
                </div>
  
                <div className="flex items-center gap-2 bg-green-800/40 px-3 py-2 rounded">
                  <CheckCircle2 size={14} className="text-green-200" />
                  <span className="text-xs">
                    Sent: {activeCampaign.sent_count ?? 0}
                  </span>
                </div>
  
                <div className="flex items-center gap-2 bg-red-800/40 px-3 py-2 rounded">
                  <XCircle size={14} className="text-red-200" />
                  <span className="text-xs">
                    Failed: {activeCampaign.failed_count ?? 0}
                  </span>
                </div>
              </div>
  
              {/* Messages list */}
              <div className="flex-1 rounded-lg border border-white/10 overflow-hidden bg-slate-950/60">
                <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <FileText size={12} />
                    <span>Messages</span>
                  </div>
  
                  <div className="flex items-center gap-2">
                    <button
                      className="text-accent text-xs hover:underline flex items-center gap-1"
                      onClick={() =>
                        fetchCampaignMessages(activeCampaign.id).catch(console.error)
                      }
                    >
                      <RefreshCcw size={12} />
                      Refresh
                    </button>
  
                    <button
                      className="text-rose-300 text-xs hover:underline flex items-center gap-1"
                      onClick={handleRetryFailed}
                    >
                      <RotateCcw size={12} />
                      Retry Failed
                    </button>
                  </div>
                </div>
  
                <div className="overflow-y-auto h-full">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-900/60 text-slate-400">
                      <tr>
                        <th className="p-2 text-left">Phone</th>
                        <th className="p-2 text-left">Status</th>
                        <th className="p-2 text-left">Error</th>
                        <th className="p-2 text-left">Vars</th>
                      </tr>
                    </thead>
  
                    <tbody>
                      {activeMessages.map((m) => (
                        <tr
                          key={m.id}
                          className="border-b border-white/5 odd:bg-slate-800/40"
                        >
                          <td className="p-2">{m.phone}</td>
                          <td className="p-2 font-semibold">
                            {m.status === "sent" && (
                              <span className="text-green-300">Sent</span>
                            )}
                            {m.status === "delivered" && (
                              <span className="text-blue-300">Delivered</span>
                            )}
                            {m.status === "failed" && (
                              <span className="text-red-300">Failed</span>
                            )}
                            {m.status === "pending" && (
                              <span className="text-slate-300">Pending</span>
                            )}
                            {m.status === "queued" && (
                              <span className="text-yellow-300">Queued</span>
                            )}
                          </td>
  
                          <td className="p-2 text-red-400 max-w-[150px] truncate">
                            {m.error || ""}
                          </td>
  
                          <td className="p-2">
                            {Object.entries(m.variables || {})
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(", ")}
                          </td>
                        </tr>
                      ))}
  
                      {activeMessages.length === 0 && (
                        <tr>
                          <td colSpan={4} className="p-4 text-center text-slate-500">
                            No messages yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
  
      </div>
    );
  }
  

  