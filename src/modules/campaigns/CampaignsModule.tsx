import { useEffect, useMemo, useState } from "react";
import {
  Megaphone,
  Upload,
  Play,
  FileText,
  PlusCircle,
  CalendarClock,
  Loader2,
} from "lucide-react";

import { useCampaignStore } from "../../state/useCampaignStore";
import { useOrganizationStore } from "../../state/useOrganizationStore";
import type { Campaign, CampaignMessage } from "../../types/database";

type ParsedCsvRow = {
  phone: string;
  variables: Record<string, string>;
};

type BuilderState = {
  name: string;
  description: string;
  templateBody: string;
  scheduledAt: string; // ISO string for datetime-local
};

type BuilderStatus =
  | { type: "success"; message: string }
  | { type: "error"; message: string }
  | null;

type CsvState = {
  rawText: string;
  headers: string[];
  rows: Record<string, string>[];
  parsedRows: ParsedCsvRow[];
  errors: string[];
  warnings: string[];
};

function extractTemplateVariables(templateBody: string): string[] {
  const regex = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;
  const vars = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(templateBody)) !== null) {
    if (match[1]) vars.add(match[1]);
  }
  return Array.from(vars);
}

function parseSimpleCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const trimmed = text.trim();
  if (!trimmed) return { headers: [], rows: [] };

  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return { headers: [], rows: [] };

  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] ?? "").trim();
    });
    rows.push(row);
  }

  return { headers, rows };
}

function mapCsvRowsToCampaignRows(headers: string[], rows: Record<string, string>[]): ParsedCsvRow[] {
  if (!headers.length || !rows.length) return [];

  const lowerHeaders = headers.map((h) => h.toLowerCase());
  const phoneIndex = lowerHeaders.indexOf("phone");

  if (phoneIndex === -1) {
    return [];
  }

  const phoneHeader = headers[phoneIndex];

  return rows
    .map((row) => {
      const rawPhone = row[phoneHeader] ?? "";
      const phone = rawPhone.replace(/[^0-9]/g, "");
      if (!phone) return null;

      const variables: Record<string, string> = {};
      headers.forEach((h, idx) => {
        if (idx === phoneIndex) return;
        variables[h] = row[h] ?? "";
      });

      return { phone, variables };
    })
    .filter((r): r is ParsedCsvRow => r !== null);
}

function renderTemplate(templateBody: string, variables: Record<string, string>): string {
  return templateBody.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key: string) => {
    const value = variables[key];
    return value != null && value !== "" ? String(value) : "";
  });
}

// Try to read a saved builder state from localStorage so the user
// does not lose progress if they refresh.
function loadBuilderStateFromStorage(orgId: string | undefined | null): BuilderState | null {
  if (!orgId) return null;
  try {
    const raw = window.localStorage.getItem(`campaign_builder_${orgId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      name: parsed.name ?? "",
      description: parsed.description ?? "",
      templateBody: parsed.templateBody ?? "",
      scheduledAt: parsed.scheduledAt ?? "",
    };
  } catch {
    return null;
  }
}

function saveBuilderStateToStorage(orgId: string | undefined | null, state: BuilderState) {
  if (!orgId) return;
  try {
    window.localStorage.setItem(`campaign_builder_${orgId}`, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function loadCsvStateFromStorage(orgId: string | undefined | null): CsvState | null {
  if (!orgId) return null;
  try {
    const raw = window.localStorage.getItem(`campaign_builder_csv_${orgId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      rawText: parsed.rawText ?? "",
      headers: [],
      rows: [],
      parsedRows: [],
      errors: [],
      warnings: [],
    };
  } catch {
    return null;
  }
}

function saveCsvRawToStorage(orgId: string | undefined | null, rawText: string) {
  if (!orgId) return;
  try {
    window.localStorage.setItem(
      `campaign_builder_csv_${orgId}`,
      JSON.stringify({ rawText }),
    );
  } catch {
    // ignore
  }
}

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

  const { currentOrganization } = useOrganizationStore();

  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [builderState, setBuilderState] = useState<BuilderState>({
    name: "",
    description: "",
    templateBody: "",
    scheduledAt: "",
  });
  const [csvState, setCsvState] = useState<CsvState>({
    rawText: "",
    headers: [],
    rows: [],
    parsedRows: [],
    errors: [],
    warnings: [],
  });
  const [builderStatus, setBuilderStatus] = useState<BuilderStatus>(null);
  const [creating, setCreating] = useState(false);
  const [launchingId, setLaunchingId] = useState<string | null>(null);

  // Load campaigns when organization changes
  useEffect(() => {
    if (!currentOrganization?.id) return;
    fetchCampaigns(currentOrganization.id).catch((err) => {
      console.error("[CampaignsModule] fetchCampaigns error", err);
    });
  }, [currentOrganization?.id, fetchCampaigns]);

  // Restore builder & CSV from localStorage when org changes
  useEffect(() => {
    if (!currentOrganization?.id) return;

    const restoredBuilder = loadBuilderStateFromStorage(currentOrganization.id);
    if (restoredBuilder) {
      setBuilderState(restoredBuilder);
    }

    const restoredCsv = loadCsvStateFromStorage(currentOrganization.id);
    if (restoredCsv) {
      setCsvState((prev) => ({
        ...prev,
        rawText: restoredCsv.rawText,
      }));
    }
  }, [currentOrganization?.id]);

  // Whenever builder changes, persist
  useEffect(() => {
    if (!currentOrganization?.id) return;
    saveBuilderStateToStorage(currentOrganization.id, builderState);
  }, [builderState, currentOrganization?.id]);

  // Whenever raw CSV changes, parse & persist
  useEffect(() => {
    if (!currentOrganization?.id) return;
    const { rawText } = csvState;
    saveCsvRawToStorage(currentOrganization.id, rawText);

    if (!rawText.trim()) {
      setCsvState((prev) => ({
        ...prev,
        headers: [],
        rows: [],
        parsedRows: [],
        errors: [],
        warnings: [],
      }));
      return;
    }

    const parsed = parseSimpleCsv(rawText);
    const mappedRows = mapCsvRowsToCampaignRows(parsed.headers, parsed.rows);

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!parsed.headers.length) {
      errors.push("CSV appears to be empty or invalid.");
    }

    if (!parsed.headers.map((h) => h.toLowerCase()).includes("phone")) {
      errors.push("CSV must include a 'phone' column.");
    }

    if (!mappedRows.length) {
      warnings.push("No valid phone numbers found after cleaning.");
    }

    const templateVars = extractTemplateVariables(builderState.templateBody);
    if (templateVars.length) {
      const headerSet = new Set(parsed.headers);
      const missing = templateVars.filter((v) => !headerSet.has(v));
      if (missing.length) {
        warnings.push(
          `Template variables missing in CSV headers: ${missing.join(", ")}`
        );
      }
    }

    setCsvState((prev) => ({
      ...prev,
      headers: parsed.headers,
      rows: parsed.rows,
      parsedRows: mappedRows,
      errors,
      warnings,
    }));
  }, [csvState.rawText, builderState.templateBody, currentOrganization?.id]);

  const selectedCampaign: Campaign | null =
    campaigns.find((c) => c.id === selectedCampaignId) ?? null;

  const selectedCampaignMessages: CampaignMessage[] =
    (selectedCampaignId && messages[selectedCampaignId]) ?? [];

  const templateVariables = useMemo(
    () => extractTemplateVariables(builderState.templateBody),
    [builderState.templateBody],
  );

  const totalRecipients = csvState.parsedRows.length;

  const handleBuilderChange = (field: keyof BuilderState, value: string) => {
    setBuilderState((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleCsvTextChange = (value: string) => {
    setCsvState((prev) => ({
      ...prev,
      rawText: value,
    }));
  };

  const handleCsvFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    handleCsvTextChange(text);
  };

  const handleCreateCampaign = async () => {
    if (!currentOrganization?.id) {
      setBuilderStatus({ type: "error", message: "Select an organization first." });
      return;
    }

    if (!builderState.name.trim()) {
      setBuilderStatus({ type: "error", message: "Campaign name is required." });
      return;
    }

    if (!builderState.templateBody.trim()) {
      setBuilderStatus({
        type: "error",
        message: "Template body is required.",
      });
      return;
    }

    if (!totalRecipients) {
      setBuilderStatus({
        type: "error",
        message: "Please upload a CSV with at least one valid phone number.",
      });
      return;
    }

    if (builderState.scheduledAt) {
      const scheduledDate = new Date(builderState.scheduledAt);
      const now = new Date();
      if (scheduledDate.getTime() < now.getTime()) {
        setBuilderStatus({
          type: "error",
          message: "Scheduled time must be in the future.",
        });
        return;
      }
    }

    setBuilderStatus(null);
    setCreating(true);

    try {
      const campaignId = await createCampaignWithMessages({
        organizationId: currentOrganization.id,
        name: builderState.name.trim(),
        description: builderState.description.trim() || undefined,
        templateBody: builderState.templateBody,
        templateVariables,
        scheduledAt: builderState.scheduledAt || null,
        rows: csvState.parsedRows,
      });

      setBuilderStatus({
        type: "success",
        message: builderState.scheduledAt
          ? "Campaign created and scheduled."
          : "Campaign created in draft status.",
      });

      setSelectedCampaignId(campaignId);
    } catch (err) {
      console.error("[CampaignsModule] createCampaignWithMessages error", err);
      setBuilderStatus({
        type: "error",
        message: "Failed to create campaign. Check console for details.",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleLaunchNow = async (campaignId: string) => {
    setLaunchingId(campaignId);
    try {
      await launchCampaign(campaignId, null);
    } catch (err) {
      console.error("[CampaignsModule] launchCampaign error", err);
    } finally {
      setLaunchingId(null);
    }
  };

  const previewText = useMemo(() => {
    if (!builderState.templateBody || !csvState.parsedRows.length) return "";
    const first = csvState.parsedRows[0];
    return renderTemplate(builderState.templateBody, first.variables);
  }, [builderState.templateBody, csvState.parsedRows]);

  if (!currentOrganization) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-white/5 bg-slate-950/60 p-6 text-sm text-slate-400">
        Select an organization from the top-left to manage campaigns.
      </div>
    );
  }

  return (
    <div className="flex h-full gap-6">
      {/* LEFT: Builder + CSV */}
      <div className="flex w-[55%] flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold text-white">
              <Megaphone className="text-accent" size={20} />
              WhatsApp Campaigns
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Upload a CSV of leads and create a personalized WhatsApp campaign.
            </p>
          </div>
        </div>

        {/* Builder Card */}
        <div className="flex flex-col gap-4 rounded-2xl border border-white/5 bg-slate-950/80 p-5">
          {builderStatus && (
            <div
              className={`rounded-lg px-4 py-2 text-sm ${
                builderStatus.type === "success"
                  ? "bg-emerald-500/10 text-emerald-300"
                  : "bg-rose-500/10 text-rose-300"
              }`}
            >
              {builderStatus.message}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {/* Campaign Name */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Campaign Name
              </label>
              <input
                type="text"
                value={builderState.name}
                onChange={(e) => handleBuilderChange("name", e.target.value)}
                placeholder="e.g. December Offers"
                className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none ring-accent/30 focus:border-accent focus:ring-2"
              />
            </div>

            {/* Scheduled At */}
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-400">
                <span>Schedule</span>
                <span className="text-[10px] lowercase text-slate-500">
                  Leave empty for draft
                </span>
              </label>
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-1.5">
                <CalendarClock size={16} className="text-slate-400" />
                <input
                  type="datetime-local"
                  value={builderState.scheduledAt}
                  onChange={(e) => handleBuilderChange("scheduledAt", e.target.value)}
                  className="w-full bg-transparent text-sm text-white outline-none"
                />
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Internal Description
            </label>
            <textarea
              rows={2}
              value={builderState.description}
              onChange={(e) => handleBuilderChange("description", e.target.value)}
              placeholder="Short description for your team."
              className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none ring-accent/30 focus:border-accent focus:ring-2"
            />
          </div>

          {/* Template Body */}
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-400">
              <span>Message Template</span>
              <span className="text-[10px] lowercase text-slate-500">
                Use variables like {"{{ name }}"} or {"{{ model }}"}
              </span>
            </label>
            <textarea
              rows={4}
              value={builderState.templateBody}
              onChange={(e) => handleBuilderChange("templateBody", e.target.value)}
              placeholder="Hi {{name}}, we have exciting offers on {{model}} this month..."
              className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none ring-accent/30 focus:border-accent focus:ring-2"
            />
          </div>

          {/* Template variables + recipients summary */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-900/80 px-2 py-1">
                <FileText size={12} />
                <span>{templateVariables.length} template variables</span>
              </span>
              {templateVariables.map((v) => (
                <span
                  key={v}
                  className="rounded-full bg-slate-900/60 px-2 py-0.5 text-[11px] text-slate-200"
                >
                  {"{{"}
                  {v}
                  {"}}"}
                </span>
              ))}
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-900/80 px-2 py-1">
              <Megaphone size={12} />
              <span>{totalRecipients} recipients</span>
            </span>
          </div>
        </div>

        {/* CSV Upload / textarea */}
        <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-accent/40 bg-slate-950/80 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm text-slate-200">
              <Upload size={16} className="text-accent" />
              <span>Upload recipients CSV</span>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent hover:bg-accent/20">
              <Upload size={14} />
              <span>Choose file</span>
              <input
                type="file"
                accept=".csv"
                onChange={handleCsvFileUpload}
                className="hidden"
              />
            </label>
          </div>

          <p className="text-xs text-slate-400">
            Required column:{" "}
            <code className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-200">
              phone
            </code>{" "}
            . Optional: any other columns you reference as template variables (e.g.{" "}
            <code className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-200">
              name
            </code>
            ,{" "}
            <code className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-200">
              model
            </code>
            ).
          </p>

          <textarea
            rows={6}
            value={csvState.rawText}
            onChange={(e) => handleCsvTextChange(e.target.value)}
            placeholder="phone,name,model&#10;9174xxxxxxx,Ritesh,Creta&#10;9174yyyyyyy,Aditi,Venue"
            className="mt-2 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-xs font-mono text-slate-100 outline-none ring-accent/30 focus:border-accent focus:ring-2"
          />

          {/* CSV validation messages */}
          {(csvState.errors.length > 0 || csvState.warnings.length > 0) && (
            <div className="space-y-1 text-xs">
              {csvState.errors.map((e, idx) => (
                <div
                  key={`err-${idx}`}
                  className="rounded bg-rose-500/10 px-2 py-1 text-rose-300"
                >
                  {e}
                </div>
              ))}
              {csvState.warnings.map((w, idx) => (
                <div
                  key={`warn-${idx}`}
                  className="rounded bg-amber-500/10 px-2 py-1 text-amber-300"
                >
                  {w}
                </div>
              ))}
            </div>
          )}

          {/* CSV preview */}
          {csvState.headers.length > 0 && csvState.rows.length > 0 && (
            <div className="mt-2 overflow-hidden rounded-lg border border-white/10 bg-slate-950/80">
              <div className="max-h-40 overflow-auto text-xs">
                <table className="min-w-full border-collapse text-left">
                  <thead className="bg-slate-900/80">
                    <tr>
                      {csvState.headers.map((h) => (
                        <th
                          key={h}
                          className="border-b border-white/10 px-2 py-1 font-semibold text-slate-200"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvState.rows.slice(0, 5).map((row, idx) => (
                      <tr key={idx} className="odd:bg-slate-900/40">
                        {csvState.headers.map((h) => (
                          <td
                            key={h}
                            className="border-b border-white/5 px-2 py-1 text-slate-300"
                          >
                            {row[h]}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {csvState.rows.length > 5 && (
                      <tr>
                        <td
                          colSpan={csvState.headers.length}
                          className="px-2 py-1 text-[10px] text-slate-500"
                        >
                          Showing first 5 rows of {csvState.rows.length} total.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Action row */}
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            Campaigns are sent via the{" "}
            <code className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-200">
              campaign-dispatch
            </code>{" "}
            edge function.
          </div>
          <button
            type="button"
            onClick={handleCreateCampaign}
            disabled={creating || loading}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/30 transition hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creating ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <PlusCircle size={16} />
            )}
            <span>
              {creating
                ? "Creating..."
                : builderState.scheduledAt
                ? "Create & Schedule"
                : "Create Draft Campaign"}
            </span>
          </button>
        </div>

        {/* Preview Card */}
        <div className="rounded-2xl border border-white/5 bg-slate-950/80 p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-100">
            <FileText size={16} className="text-accent" />
            Preview (first recipient)
          </h2>
          {previewText ? (
            <p className="whitespace-pre-wrap rounded-lg bg-slate-900/80 p-3 text-sm text-slate-100">
              {previewText}
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              Add a template and CSV to preview the final WhatsApp message.
            </p>
          )}
        </div>
      </div>

      {/* RIGHT: Campaign list + details */}
      <div className="flex w-[45%] flex-col gap-4">
        {/* Campaign List */}
        <div className="rounded-2xl border border-white/5 bg-slate-950/80 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <Megaphone size={16} className="text-accent" />
              Campaigns
            </h2>
          </div>

          {loading && !campaigns.length && (
            <p className="text-sm text-slate-400">Loading campaigns...</p>
          )}

          {!loading && !campaigns.length && (
            <p className="text-sm text-slate-400">
              No campaigns yet. Create one using the form on the left.
            </p>
          )}

          {campaigns.length > 0 && (
            <div className="mt-2 space-y-2">
              {campaigns.map((c) => {
                const isSelected = c.id === selectedCampaignId;
                const canLaunch =
                  c.status === "draft" || c.status === "scheduled";

                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedCampaignId(c.id)}
                    className={`w-full rounded-xl border px-3 py-2 text-left text-xs transition ${
                      isSelected
                        ? "border-accent bg-accent/10"
                        : "border-white/10 bg-slate-900/60 hover:border-accent/50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-slate-50">
                          {c.name}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {c.description || "No description"}
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="rounded-full bg-slate-950/80 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-200">
                          {c.status}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {c.total_recipients} recipients · {c.sent_count} sent ·{" "}
                          {c.failed_count} failed
                        </span>
                      </div>
                    </div>

                    {c.scheduled_at && (
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
                        <CalendarClock size={12} />
                        <span>
                          Scheduled:{" "}
                          {new Date(c.scheduled_at).toLocaleString()}
                        </span>
                      </div>
                    )}

                    {canLaunch && (
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleLaunchNow(c.id);
                          }}
                          disabled={launchingId === c.id}
                          className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                        >
                          {launchingId === c.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Play size={12} />
                          )}
                          <span>
                            {launchingId === c.id ? "Launching..." : "Launch"}
                          </span>
                        </button>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Campaign Details */}
        <div className="flex-1 rounded-2xl border border-white/5 bg-slate-950/80 p-4">
          {!selectedCampaign && (
            <p className="text-sm text-slate-400">
              Select a campaign to view delivery details.
            </p>
          )}

          {selectedCampaign && (
            <div className="flex h-full flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-100">
                    {selectedCampaign.name}
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    {selectedCampaign.description || "No description"}
                  </p>
                </div>
                <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-200">
                  {selectedCampaign.status}
                </span>
              </div>

              <div className="text-[11px] text-slate-500">
                <div>
                  Scheduled:{" "}
                  {selectedCampaign.scheduled_at
                    ? new Date(
                        selectedCampaign.scheduled_at,
                      ).toLocaleString()
                    : "Not scheduled"}
                </div>
                <div>
                  Started:{" "}
                  {selectedCampaign.started_at
                    ? new Date(selectedCampaign.started_at).toLocaleString()
                    : "Not started"}
                </div>
                <div>
                  Completed:{" "}
                  {selectedCampaign.completed_at
                    ? new Date(selectedCampaign.completed_at).toLocaleString()
                    : "Not completed"}
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-400">
                <span className="rounded-full bg-slate-900/80 px-2 py-0.5">
                  {selectedCampaign.total_recipients} recipients
                </span>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                  {selectedCampaign.sent_count} sent
                </span>
                <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-rose-300">
                  {selectedCampaign.failed_count} failed
                </span>
              </div>

              {/* Messages */}
              <div className="mt-3 flex-1 overflow-hidden rounded-lg border border-white/10 bg-slate-950/80">
                <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-xs text-slate-300">
                  <div className="flex items-center gap-2">
                    <FileText size={12} />
                    <span>Messages</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedCampaignId) {
                        fetchCampaignMessages(selectedCampaignId).catch((err) =>
                          console.error(
                            "[CampaignsModule] fetchCampaignMessages error",
                            err,
                          ),
                        );
                      }
                    }}
                    className="text-[11px] text-accent hover:underline"
                  >
                    Refresh
                  </button>
                </div>

                <div className="max-h-64 overflow-auto text-xs">
                  {selectedCampaignMessages.length > 0 ? (
                    <table className="min-w-full border-collapse">
                      <thead>
                        <tr className="bg-slate-900/80">
                          <th className="border-b border-white/10 px-2 py-1 text-left font-semibold">
                            Phone
                          </th>
                          <th className="border-b border-white/10 px-2 py-1 text-left font-semibold">
                            Status
                          </th>
                          <th className="border-b border-white/10 px-2 py-1 text-left font-semibold">
                            Dispatched
                          </th>
                          <th className="border-b border-white/10 px-2 py-1 text-left font-semibold">
                            Error
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedCampaignMessages.map((m) => (
                          <tr key={m.id} className="odd:bg-slate-900/40">
                            <td className="border-b border-white/5 px-2 py-1">
                              {m.phone}
                            </td>
                            <td className="border-b border-white/5 px-2 py-1">
                              <span className="rounded-full bg-slate-900/80 px-2 py-0.5 text-[10px] uppercase tracking-wide">
                                {m.status}
                              </span>
                            </td>
                            <td className="border-b border-white/5 px-2 py-1">
                              {m.dispatched_at
                                ? new Date(m.dispatched_at).toLocaleString()
                                : "-"}
                            </td>
                            <td className="border-b border-white/5 px-2 py-1 text-rose-300">
                              {m.error || "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="px-3 py-2 text-xs text-slate-400">
                      No messages yet. Once dispatch runs, message rows will
                      appear here.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
