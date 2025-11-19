import { useEffect, useMemo, useState } from 'react';
import {
  Megaphone,
  Upload,
  Play,
  FileText,
  PlusCircle,
  CalendarClock,
} from 'lucide-react';

import { supabase } from '../../lib/supabaseClient';   // 🔥 added
import { useCampaignStore } from '../../state/useCampaignStore';
import { useOrganizationStore } from '../../state/useOrganizationStore';
import type { Campaign, CampaignMessage } from '../../types/database';

// -------------------------------------------------------------
// DEBUG: show which auth user is logged into the frontend
// -------------------------------------------------------------
supabase.auth.getUser().then((res) => {
  console.log("FRONTEND AUTH USER:", res);
});

// -------------------------------------------------------------
// Types
// -------------------------------------------------------------

type ParsedCsvRow = {
  phone: string;
  variables: Record<string, string>;
};

type BuilderState = {
  name: string;
  description: string;
  templateBody: string;
  scheduledAt: string;
};

// -------------------------------------------------------------
// TEMPLATE VARIABLE EXTRACTOR
// -------------------------------------------------------------
function extractTemplateVariables(templateBody: string): string[] {
  const regex = /{{\s*([\w.]+)\s*}}/g;
  const vars = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(templateBody)) !== null) {
    if (match[1]) vars.add(match[1]);
  }
  return Array.from(vars);
}

// -------------------------------------------------------------
// SIMPLE CSV PARSER
// -------------------------------------------------------------
function parseSimpleCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return { headers: [], rows: [] };

  const headers = lines[0].split(',').map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cols = line.split(',');
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = (cols[idx] ?? '').trim();
    });
    rows.push(row);
  }

  return { headers, rows };
}

// -------------------------------------------------------------
// MAP CSV ROWS → INTERNAL RECIPIENT STRUCT
// -------------------------------------------------------------
function mapCsvRowsToCampaignRows(
  headers: string[],
  rows: Record<string, string>[]
): ParsedCsvRow[] {
  if (!headers.length || !rows.length) return [];

  const phoneHeader =
    headers.find((h) => h.toLowerCase() === 'phone') ??
    headers.find((h) => h.toLowerCase() === 'phone_number') ??
    headers.find((h) => h.toLowerCase().includes('whatsapp')) ??
    headers[0];

  return rows
    .map((row) => {
      const phone = row[phoneHeader]?.trim();
      if (!phone) return null;
      const { [phoneHeader]: _, ...rest } = row;
      return {
        phone,
        variables: rest,
      } as ParsedCsvRow;
    })
    .filter((row): row is ParsedCsvRow => row !== null);
}

// -------------------------------------------------------------
// FORMAT DATETIME FOR <input type="datetime-local">
// -------------------------------------------------------------
function formatDateTimeForInput(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
  ].join('');
}

// -------------------------------------------------------------
// MAIN COMPONENT START
// -------------------------------------------------------------
export function CampaignsModule() {
  const {
    campaigns,
    messages,
    loading,
    fetchCampaigns,
    fetchCampaignMessages,
    createCampaignWithMessages,
  } = useCampaignStore();

  const { currentOrganization } = useOrganizationStore();

  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  const [csvTextPreview, setCsvTextPreview] = useState<string>('');
  const [csvRows, setCsvRows] = useState<ParsedCsvRow[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [builderState, setBuilderState] = useState<BuilderState>({
    name: '',
    description: '',
    templateBody: 'Hi {{name}}, your offer for {{car_model}} is ready!',
    scheduledAt: formatDateTimeForInput(new Date()),
  });

  // -------------------------------------------------------------
  // Load campaigns
  // -------------------------------------------------------------
  useEffect(() => {
    if (currentOrganization) {
      fetchCampaigns(currentOrganization.id).catch(console.error);
    }
  }, [currentOrganization, fetchCampaigns]);
  // -------------------------------------------------------------
  // Auto-load messages when selecting a campaign
  // -------------------------------------------------------------
  useEffect(() => {
    if (selectedCampaignId) {
      fetchCampaignMessages(selectedCampaignId).catch(console.error);
    }
  }, [selectedCampaignId, fetchCampaignMessages]);

  // -------------------------------------------------------------
  // Derived Data
  // -------------------------------------------------------------
  const selectedCampaign: Campaign | null =
    campaigns.find((c) => c.id === selectedCampaignId) ?? null;

  const selectedCampaignMessages: CampaignMessage[] =
    (selectedCampaignId && messages[selectedCampaignId]) ?? [];

  const templateVariables = useMemo(
    () => extractTemplateVariables(builderState.templateBody),
    [builderState.templateBody]
  );

  const totalRecipients = csvRows.length;

  const handleBuilderChange = (
    field: keyof BuilderState,
    value: string
  ) => {
    setBuilderState((prev) => ({ ...prev, [field]: value }));
  };

  // -------------------------------------------------------------
  // CSV UPLOAD
  // -------------------------------------------------------------
  const handleCsvUpload: React.ChangeEventHandler<HTMLInputElement> = async (
    event
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvTextPreview(text.slice(0, 2000));
    const { headers, rows } = parseSimpleCsv(text);
    setCsvHeaders(headers);
    const mapped = mapCsvRowsToCampaignRows(headers, rows);
    setCsvRows(mapped);
  };

  // -------------------------------------------------------------
  // CREATE CAMPAIGN
  // -------------------------------------------------------------
  const handleCreateCampaign = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentOrganization) return;
    if (!builderState.name.trim()) return;
    if (!builderState.templateBody.trim()) return;
    if (!csvRows.length) return;

    const scheduledAtIso = builderState.scheduledAt
      ? new Date(builderState.scheduledAt).toISOString()
      : null;

    setSubmitting(true);
    try {
      const rows = csvRows.map((row) => ({
        phone: row.phone,
        variables: row.variables,
      }));

      const campaignId = await createCampaignWithMessages({
        organizationId: currentOrganization.id,
        name: builderState.name.trim(),
        description: builderState.description.trim() || undefined,
        templateBody: builderState.templateBody,
        templateVariables,
        scheduledAt: scheduledAtIso,
        rows,
      });

      setSelectedCampaignId(campaignId);

      setBuilderState((prev) => ({
        ...prev,
        name: '',
        description: '',
      }));
      setCsvRows([]);
      setCsvHeaders([]);
      setCsvTextPreview('');
    } catch (error) {
      console.error('[CampaignsModule] createCampaign error', error);
      alert('Failed to create campaign. Check console for details.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectCampaign = (campaignId: string) => {
    setSelectedCampaignId(campaignId);
  };

  const statsForCampaign = (campaignId: string) => {
    const msgs = messages[campaignId] ?? [];
    return {
      total: msgs.length,
      pending: msgs.filter(
        (m) => m.status === 'pending' || m.status === 'queued'
      ).length,
      sent: msgs.filter((m) => m.status === 'sent').length,
      failed: msgs.filter((m) => m.status === 'failed').length,
    };
  };

  // -------------------------------------------------------------
  // RENDER
  // -------------------------------------------------------------
  return (
    <div className="grid h-full grid-cols-[320px,1fr] gap-6">
      {/* LEFT: Campaign history */}
      <div className="flex h-full flex-col rounded-2xl border border-white/5 bg-slate-950/80 p-4 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-400">
              <Megaphone className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-50">Campaigns</h2>
              <p className="text-xs text-slate-400">
                History & status for this organization
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setSelectedCampaignId(null)}
            className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1 text-xs font-medium text-emerald-950 hover:bg-emerald-400"
          >
            <PlusCircle className="h-4 w-4" />
            New
          </button>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto pr-1 text-xs">
          {loading && <p className="text-slate-400">Loading campaigns…</p>}

          {!loading && campaigns.length === 0 && (
            <p className="text-slate-500">
              No campaigns yet. Click <span className="font-semibold">New</span> to
              create your first one.
            </p>
          )}

          {campaigns.map((campaign) => {
            const isActive = campaign.id === selectedCampaignId;
            const stats = statsForCampaign(campaign.id);

            return (
              <button
                key={campaign.id}
                type="button"
                onClick={() => handleSelectCampaign(campaign.id)}
                className={`w-full rounded-xl border px-3 py-2 text-left transition hover:border-emerald-400/70 ${
                  isActive
                    ? 'border-emerald-400/70 bg-emerald-500/5'
                    : 'border-white/5 bg-slate-900/70'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-50">
                    {campaign.name}
                  </span>

                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
                    {campaign.status}
                  </span>
                </div>

                <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                  <span>
                    {campaign.scheduled_at
                      ? `Scheduled: ${new Date(
                          campaign.scheduled_at
                        ).toLocaleString()}`
                      : 'Not scheduled'}
                  </span>
                </div>

                <div className="mt-1 flex gap-2 text-[10px] text-slate-400">
                  <span>Total: {stats.total || campaign.total_recipients}</span>
                  <span>Sent: {stats.sent}</span>
                  <span>Failed: {stats.failed}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* RIGHT: Builder / Details */}
      <div className="flex h-full flex-col gap-4">
        {/* BUILDER */}
        {!selectedCampaign && (
          <form
            onSubmit={handleCreateCampaign}
            className="rounded-2xl border border-white/5 bg-slate-950/80 p-4 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-400">
                  <FileText className="h-4 w-4" />
                </div>

                <div>
                  <h2 className="text-sm font-semibold text-slate-50">
                    Campaign Builder
                  </h2>
                  <p className="text-xs text-slate-400">
                    Upload CSV, define template, schedule & launch.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-[11px] text-slate-300">
                <CalendarClock className="h-3 w-3" />
                <span>Send at</span>

                <input
                  type="datetime-local"
                  className="rounded-md border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-100 outline-none"
                  value={builderState.scheduledAt}
                  onChange={(e) => handleBuilderChange('scheduledAt', e.target.value)}
                />
              </div>
            </div>
            {/* FORM BODY */}
            <div className="grid grid-cols-2 gap-4">

              {/* LEFT SIDE — Form Fields */}
              <div className="space-y-3">
                
                {/* Campaign Name */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-200">
                    Campaign name
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs text-slate-50 outline-none placeholder:text-slate-500"
                    placeholder="Diwali Offer Blast – Baleno & Swift"
                    value={builderState.name}
                    onChange={(e) => handleBuilderChange("name", e.target.value)}
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-200">
                    Description (internal)
                  </label>
                  <textarea
                    rows={2}
                    className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs text-slate-50 outline-none placeholder:text-slate-500"
                    placeholder="Notes for your team – which offer, which audience, etc."
                    value={builderState.description}
                    onChange={(e) => handleBuilderChange("description", e.target.value)}
                  />
                </div>

                {/* Template */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-200">
                    Message template
                  </label>
                  <textarea
                    rows={6}
                    className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs text-slate-50 outline-none placeholder:text-slate-500"
                    value={builderState.templateBody}
                    onChange={(e) =>
                      handleBuilderChange("templateBody", e.target.value)
                    }
                  />
                  
                  {/* Template Variables Preview */}
                  {templateVariables.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-slate-300">
                      <span className="text-slate-500">Variables:</span>
                      {templateVariables.map((v) => (
                        <span
                          key={v}
                          className="rounded-full bg-slate-800/80 px-2 py-0.5"
                        >
                          {v}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT SIDE — CSV Upload */}
              <div className="space-y-3">

                {/* Recipient CSV */}
                <div>
                  <label className="mb-1 flex items-center justify-between text-xs font-medium text-slate-200">
                    Recipient CSV
                    <span className="text-[10px] font-normal text-slate-400">
                      Must include a <code>phone</code> column
                    </span>
                  </label>

                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-emerald-400/60 bg-emerald-500/5 px-3 py-8 text-xs font-medium text-emerald-300 hover:bg-emerald-500/10">
                    <Upload className="h-4 w-4" />
                    <span>Upload CSV file</span>
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      className="hidden"
                      onChange={handleCsvUpload}
                    />
                  </label>

                  {totalRecipients > 0 && (
                    <p className="mt-1 text-[11px] text-emerald-300">
                      Loaded{" "}
                      <span className="font-semibold">{totalRecipients}</span>{" "}
                      recipients.
                    </p>
                  )}
                </div>

                {/* CSV Headers Preview */}
                {csvHeaders.length > 0 && (
                  <div className="rounded-xl border border-white/10 bg-slate-900/80 p-2">
                    <div className="mb-1 flex items-center gap-1 text-[11px] text-slate-300">
                      <FileText className="h-3 w-3" />
                      <span>CSV Headers</span>
                    </div>
                    <div className="flex flex-wrap gap-1 text-[10px] text-slate-300">
                      {csvHeaders.map((h) => (
                        <span
                          key={h}
                          className="rounded-full bg-slate-800/80 px-2 py-0.5"
                        >
                          {h}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* CSV Preview */}
                {csvTextPreview && (
                  <div className="rounded-xl border border-white/10 bg-slate-900/80 p-2">
                    <div className="mb-1 flex items-center justify-between text-[11px] text-slate-300">
                      <span>CSV Preview</span>
                      <span className="text-[10px] text-slate-500">
                        Showing first ~2KB
                      </span>
                    </div>
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all text-[10px] text-slate-200">
                      {csvTextPreview}
                    </pre>
                  </div>
                )}
              </div>
            </div>

            {/* FOOTER */}
            <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
              <div className="text-[11px] text-slate-400">
                {totalRecipients > 0 ? (
                  <>
                    Ready to send to{" "}
                    <span className="font-semibold text-emerald-300">
                      {totalRecipients}
                    </span>{" "}
                    recipients.
                  </>
                ) : (
                  <>Upload a CSV to see recipient count.</>
                )}
              </div>

              <button
                type="submit"
                disabled={
                  submitting ||
                  !builderState.name.trim() ||
                  !builderState.templateBody.trim() ||
                  !totalRecipients
                }
                className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-emerald-950 shadow hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-500"
              >
                <Play className="h-4 w-4" />
                {submitting ? "Launching…" : "Create & Schedule Campaign"}
              </button>
            </div>
          </form>
        )}

        {/* -------------------------------------------------------------
           SELECTED CAMPAIGN DETAILS / Recipient Messages
        ------------------------------------------------------------- */}
        {selectedCampaign && (
          <div className="flex h-full flex-col gap-3">

            {/* HEADER */}
            <div className="rounded-2xl border border-white/5 bg-slate-950/80 p-4 shadow-xl">
              <div className="flex items-center justify-between">

                <div>
                  <h2 className="text-sm font-semibold text-slate-50">
                    {selectedCampaign.name}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {selectedCampaign.description || "No description"}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-1 text-[11px] text-slate-300">
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 uppercase tracking-wide">
                    {selectedCampaign.status}
                  </span>

                  {selectedCampaign.scheduled_at && (
                    <span className="text-slate-400">
                      Scheduled:{" "}
                      {new Date(selectedCampaign.scheduled_at).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* RECIPIENT MESSAGES LIST */}
            <div className="flex-1 rounded-2xl border border-white/5 bg-slate-950/80 p-4 shadow-xl">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Megaphone className="h-4 w-4 text-emerald-400" />
                  <h3 className="text-xs font-semibold text-slate-100">
                    Recipient Messages
                  </h3>
                </div>
                <span className="text-[11px] text-slate-400">
                  {selectedCampaignMessages.length} messages
                </span>
              </div>

              <div className="h-[260px] space-y-2 overflow-y-auto pr-1 text-[11px] text-slate-200">
                {selectedCampaignMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className="flex items-start justify-between rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2"
                  >
                    <div className="flex-1">
                      <div className="text-[10px] text-slate-400">
                        {msg.phone}
                      </div>

                      {msg.variables && (
                        <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-slate-300">
                          {Object.entries(msg.variables).map(([key, value]) => (
                            <span
                              key={key}
                              className="rounded-full bg-slate-800/80 px-2 py-0.5"
                            >
                              {key}: {String(value)}
                            </span>
                          ))}
                        </div>
                      )}

                      {msg.error && (
                        <div className="mt-1 text-[10px] text-red-300">
                          Error: {msg.error}
                        </div>
                      )}
                    </div>

                    <div className="ml-2 flex flex-col items-end gap-1 text-[10px] text-slate-400">
                      <span
                        className={
                          msg.status === "sent"
                            ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-300"
                            : msg.status === "failed"
                            ? "rounded-full bg-red-500/10 px-2 py-0.5 text-red-300"
                            : "rounded-full bg-slate-800/80 px-2 py-0.5"
                        }
                      >
                        {msg.status}
                      </span>

                      {msg.dispatched_at && (
                        <span>
                          {new Date(msg.dispatched_at).toLocaleTimeString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {!selectedCampaignMessages.length && (
                  <p className="text-slate-400">
                    No messages yet. Once dispatch runs, they will appear here.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
