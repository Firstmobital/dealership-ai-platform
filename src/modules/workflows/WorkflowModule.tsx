import { useEffect, useState } from 'react';
import { ListChecks, PlusCircle, RefreshCcw, Play, Save } from 'lucide-react';
import { useOrganizationStore } from '../../state/useOrganizationStore';
import { useWorkflowStore } from '../../state/useWorkflowStore';

const stepTemplates = [
  { label: 'Ask User', action: { type: 'ask_user', prompt: 'Ask for missing customer info' } },
  { label: 'Save to DB', action: { type: 'save_to_db', table: 'contacts' } },
  { label: 'Fetch KB', action: { type: 'fetch_kb', top_k: 3 } },
  { label: 'LLM Action', action: { type: 'llm', model: 'gpt-4o-mini' } },
  { label: 'End Step', action: { type: 'end' } }
];

type NewStep = {
  action: Record<string, unknown>;
  step_order: number;
};

export function WorkflowModule() {
  const { currentOrganization } = useOrganizationStore();
  const { workflows, steps, logs, fetchWorkflows, fetchWorkflowSteps, fetchWorkflowLogs, saveWorkflow, saveStep } =
    useWorkflowStore();
  const [selectedWorkflow, setSelectedWorkflow] = useState<string | null>(null);
  const [workflowForm, setWorkflowForm] = useState({ name: '', description: '', trigger: '{}' });
  const [newStep, setNewStep] = useState<NewStep | null>(null);
  const [previewOutput, setPreviewOutput] = useState<string>('');

  useEffect(() => {
    if (currentOrganization) {
      fetchWorkflows(currentOrganization.id).catch(console.error);
    }
  }, [currentOrganization, fetchWorkflows]);

  useEffect(() => {
    if (selectedWorkflow && !steps[selectedWorkflow]) {
      fetchWorkflowSteps(selectedWorkflow).catch(console.error);
      fetchWorkflowLogs(selectedWorkflow).catch(console.error);
    }
  }, [selectedWorkflow, steps, fetchWorkflowSteps, fetchWorkflowLogs]);

  const handleSelectWorkflow = (workflowId: string) => {
    setSelectedWorkflow(workflowId);
    const workflow = workflows.find((item) => item.id === workflowId);
    if (workflow) {
      setWorkflowForm({
        name: workflow.name,
        description: workflow.description ?? '',
        trigger: JSON.stringify(workflow.trigger ?? {}, null, 2)
      });
    }
  };

  const handleSaveWorkflow = async () => {
    if (!currentOrganization) return;
    const id = await saveWorkflow({
      id: selectedWorkflow ?? undefined,
      organization_id: currentOrganization.id,
      name: workflowForm.name,
      description: workflowForm.description,
      trigger: JSON.parse(workflowForm.trigger || '{}')
    });
    setSelectedWorkflow(id);
  };

  const handleAddStep = async () => {
    if (!selectedWorkflow || !newStep) return;
    await saveStep(selectedWorkflow, { action: newStep.action, step_order: newStep.step_order });
    setNewStep(null);
  };

  const handlePreview = () => {
    const workflow = workflows.find((item) => item.id === selectedWorkflow);
    const workflowSteps = selectedWorkflow ? steps[selectedWorkflow] ?? [] : [];
    const summary = {
      workflow,
      steps: workflowSteps,
      result: 'Simulated response generated.'
    };
    setPreviewOutput(JSON.stringify(summary, null, 2));
  };

  return (
    <div className="grid grid-cols-[280px,1fr,320px] gap-6">
      <div className="flex flex-col rounded-2xl border border-white/5 bg-slate-900/60">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Workflows</h2>
          <button
            onClick={() => {
              setSelectedWorkflow(null);
              setWorkflowForm({ name: '', description: '', trigger: '{}' });
            }}
            className="flex items-center gap-2 rounded-md border border-white/10 px-3 py-1 text-xs text-slate-200 hover:border-accent hover:text-white"
          >
            <PlusCircle size={14} />
            New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {workflows.map((workflow) => (
            <button
              key={workflow.id}
              onClick={() => handleSelectWorkflow(workflow.id)}
              className={`flex w-full flex-col gap-1 border-b border-white/5 px-4 py-3 text-left transition hover:bg-white/5 ${
                selectedWorkflow === workflow.id ? 'bg-accent/10' : ''
              }`}
            >
              <span className="text-sm font-medium text-white">{workflow.name}</span>
              <span className="text-xs text-slate-400">{workflow.description}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div className="rounded-2xl border border-white/5 bg-slate-900/60">
          <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-white">{selectedWorkflow ? 'Edit Workflow' : 'New Workflow'}</h2>
              <p className="text-xs text-slate-400">Configure AI workflows that respond to trigger conditions.</p>
            </div>
            <button
              onClick={handleSaveWorkflow}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/80"
            >
              <Save size={16} /> Save Workflow
            </button>
          </div>
          <div className="space-y-4 px-6 py-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-400">Name</label>
              <input
                value={workflowForm.name}
                onChange={(event) => setWorkflowForm((prev) => ({ ...prev, name: event.target.value }))}
                className="mt-1 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-400">Description</label>
              <textarea
                value={workflowForm.description}
                onChange={(event) => setWorkflowForm((prev) => ({ ...prev, description: event.target.value }))}
                className="mt-1 h-24 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-400">Trigger Configuration</label>
              <textarea
                value={workflowForm.trigger}
                onChange={(event) => setWorkflowForm((prev) => ({ ...prev, trigger: event.target.value }))}
                className="mt-1 h-32 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-2 font-mono text-xs text-white focus:border-accent focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="rounded-2xl border border-white/5 bg-slate-900/60">
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Steps</h3>
              <button
                onClick={handleAddStep}
                disabled={!newStep}
                className="flex items-center gap-2 rounded-md border border-white/10 px-3 py-1 text-xs text-slate-200 transition hover:border-accent hover:text-white disabled:opacity-50"
              >
                <Save size={14} /> Save Step
              </button>
            </div>
            <div className="space-y-3 px-6 py-4 text-sm">
              {(selectedWorkflow ? steps[selectedWorkflow] ?? [] : []).map((step) => (
                <div key={step.id} className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-400">Order {step.step_order}</div>
                  <pre className="mt-2 whitespace-pre-wrap break-all text-xs text-slate-200">
{JSON.stringify(step.action, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-slate-900/60">
            <div className="border-b border-white/5 px-6 py-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Add Step</h3>
            </div>
            <div className="space-y-4 px-6 py-4">
              <label className="text-xs uppercase tracking-wide text-slate-400">Template</label>
              <select
                value={newStep ? JSON.stringify(newStep.action) : ''}
                onChange={(event) => {
                  const template = stepTemplates.find((item) => JSON.stringify(item.action) === event.target.value);
                  if (template) {
                    setNewStep({ action: template.action, step_order: (steps[selectedWorkflow ?? '']?.length ?? 0) + 1 });
                  }
                }}
                className="w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
              >
                <option value="">Select template</option>
                {stepTemplates.map((template) => (
                  <option key={template.label} value={JSON.stringify(template.action)}>
                    {template.label}
                  </option>
                ))}
              </select>
              {newStep && (
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-400">Step Order</label>
                  <input
                    type="number"
                    min={1}
                    value={newStep.step_order}
                    onChange={(event) =>
                      setNewStep((prev) => (prev ? { ...prev, step_order: Number(event.target.value) } : prev))
                    }
                    className="mt-1 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-white/5 bg-slate-900/60">
          <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-300">
              <Play size={14} /> Preview
            </h3>
            <button
              onClick={handlePreview}
              className="flex items-center gap-2 rounded-md border border-white/10 px-3 py-1 text-xs text-slate-200 hover:border-accent hover:text-white"
            >
              <RefreshCcw size={14} /> Run
            </button>
          </div>
          <pre className="h-56 overflow-y-auto px-5 py-4 text-xs text-slate-200">{previewOutput}</pre>
        </div>

        <div className="flex-1 rounded-2xl border border-white/5 bg-slate-900/60">
          <div className="flex items-center gap-2 border-b border-white/5 px-5 py-3">
            <ListChecks size={14} className="text-accent" /> Logs
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4 text-xs">
            {(selectedWorkflow ? logs[selectedWorkflow] ?? [] : []).map((log) => (
              <div key={log.id} className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
                <div className="text-[11px] uppercase tracking-wide text-slate-400">Conversation: {log.conversation_id}</div>
                <pre className="mt-2 whitespace-pre-wrap break-all text-[11px] text-slate-200">
{JSON.stringify(log.data, null, 2)}
                </pre>
              </div>
            ))}
            {!selectedWorkflow && <p className="text-slate-400">Select a workflow to inspect logs.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
