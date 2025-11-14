import { useEffect, useState } from 'react';
import { Megaphone, Upload, Play, FileText, PlusCircle } from 'lucide-react';
import { useCampaignStore } from '../../state/useCampaignStore';
import { useOrganizationStore } from '../../state/useOrganizationStore';

export function CampaignsModule() {
  const { campaigns, contacts, logs, fetchCampaigns, fetchCampaignContacts, fetchCampaignLogs, saveCampaign } =
    useCampaignStore();
  const { currentOrganization } = useOrganizationStore();
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [campaignForm, setCampaignForm] = useState({ name: '', template_id: '', status: 'draft' });
  const [csvPreview, setCsvPreview] = useState<string>('');

  useEffect(() => {
    if (currentOrganization) {
      fetchCampaigns(currentOrganization.id).catch(console.error);
    }
  }, [currentOrganization, fetchCampaigns]);

  useEffect(() => {
    if (selectedCampaign && !contacts[selectedCampaign]) {
      fetchCampaignContacts(selectedCampaign).catch(console.error);
      fetchCampaignLogs(selectedCampaign).catch(console.error);
    }
  }, [selectedCampaign, contacts, fetchCampaignContacts, fetchCampaignLogs]);

  const handleSelectCampaign = (campaignId: string) => {
    setSelectedCampaign(campaignId);
    const campaign = campaigns.find((item) => item.id === campaignId);
    if (campaign) {
      setCampaignForm({ name: campaign.name, template_id: campaign.template_id ?? '', status: campaign.status });
    }
  };

  const handleSaveCampaign = async () => {
    if (!currentOrganization) return;
    await saveCampaign({
      id: selectedCampaign ?? undefined,
      organization_id: currentOrganization.id,
      name: campaignForm.name,
      template_id: campaignForm.template_id,
      status: campaignForm.status as any,
      total_contacts: 0,
      sent_count: 0
    });
  };

  const handleCsvUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvPreview(text.slice(0, 500));
  };

  return (
    <div className="grid grid-cols-[280px,1fr,320px] gap-6">
      <div className="flex flex-col rounded-2xl border border-white/5 bg-slate-900/60">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Campaigns</h2>
          <button
            onClick={() => {
              setSelectedCampaign(null);
              setCampaignForm({ name: '', template_id: '', status: 'draft' });
            }}
            className="flex items-center gap-2 rounded-md border border-white/10 px-3 py-1 text-xs text-slate-200 hover:border-accent hover:text-white"
          >
            <PlusCircle size={14} />
            New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {campaigns.map((campaign) => (
            <button
              key={campaign.id}
              onClick={() => handleSelectCampaign(campaign.id)}
              className={`flex w-full flex-col gap-1 border-b border-white/5 px-4 py-3 text-left transition hover:bg-white/5 ${
                selectedCampaign === campaign.id ? 'bg-accent/10' : ''
              }`}
            >
              <span className="text-sm font-medium text-white">{campaign.name}</span>
              <span className="text-xs text-slate-400">{campaign.status}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div className="rounded-2xl border border-white/5 bg-slate-900/60">
          <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-white">{selectedCampaign ? 'Edit Campaign' : 'New Campaign'}</h2>
              <p className="text-xs text-slate-400">Craft WhatsApp outreach with templates and personalization.</p>
            </div>
            <button onClick={handleSaveCampaign} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white">
              Save Campaign
            </button>
          </div>
          <div className="space-y-4 px-6 py-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-400">Name</label>
              <input
                value={campaignForm.name}
                onChange={(event) => setCampaignForm((prev) => ({ ...prev, name: event.target.value }))}
                className="mt-1 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-400">Template ID</label>
              <input
                value={campaignForm.template_id}
                onChange={(event) => setCampaignForm((prev) => ({ ...prev, template_id: event.target.value }))}
                className="mt-1 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-400">Status</label>
              <select
                value={campaignForm.status}
                onChange={(event) => setCampaignForm((prev) => ({ ...prev, status: event.target.value }))}
                className="mt-1 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
              >
                <option value="draft">Draft</option>
                <option value="scheduled">Scheduled</option>
                <option value="sending">Sending</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-400">Upload Contacts (CSV)</label>
              <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-white/10 px-4 py-3 text-sm text-slate-200 hover:border-accent hover:text-white">
                <Upload size={16} /> Select file
                <input type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
              </label>
              {csvPreview && (
                <pre className="mt-2 max-h-40 overflow-y-auto rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-xs text-slate-200">
{csvPreview}
                </pre>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="rounded-2xl border border-white/5 bg-slate-900/60">
            <div className="border-b border-white/5 px-6 py-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Variable Mapping</h3>
            </div>
            <div className="space-y-3 px-6 py-4 text-sm text-slate-200">
              <div className="flex items-center justify-between">
                <span>{"{{name}}"}</span>
                <span>Contact Name</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{"{{model}}"}</span>
                <span>Preferred Model</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{"{{appointment}}"}</span>
                <span>Appointment Date</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-slate-900/60">
            <div className="border-b border-white/5 px-6 py-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Dispatch</h3>
            </div>
            <div className="space-y-3 px-6 py-4 text-sm text-slate-200">
              <button className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/80">
                <Play size={16} /> Send Campaign
              </button>
              <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3 text-xs">
                <div>Status: {campaignForm.status}</div>
                <div>Total Contacts: {selectedCampaign ? campaigns.find((c) => c.id === selectedCampaign)?.total_contacts ?? 0 : 0}</div>
                <div>Sent: {selectedCampaign ? campaigns.find((c) => c.id === selectedCampaign)?.sent_count ?? 0 : 0}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-white/5 bg-slate-900/60">
          <div className="flex items-center gap-2 border-b border-white/5 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
            <FileText size={14} className="text-accent" /> Template Preview
          </div>
          <div className="space-y-3 px-5 py-4 text-sm text-slate-200">
            <p>Hello {"{{name}}"},</p>
            <p>
              Thanks for checking out the latest arrivals at Joyz Motors. The {"{{model}}"} you liked is available for a
              test drive this week!
            </p>
            <p>Reply YES to confirm your {"{{appointment}}"} slot.</p>
          </div>
        </div>

        <div className="flex-1 rounded-2xl border border-white/5 bg-slate-900/60">
          <div className="border-b border-white/5 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
            Campaign Activity
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4 text-xs">
            {(selectedCampaign ? logs[selectedCampaign] ?? [] : []).map((log) => (
              <div key={log.id} className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
                <div>Contact: {log.contact_id}</div>
                <pre className="mt-2 whitespace-pre-wrap break-all text-[11px] text-slate-200">
{JSON.stringify(log.response, null, 2)}
                </pre>
              </div>
            ))}
            {!selectedCampaign && <p className="text-slate-400">Select a campaign to review activity.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
