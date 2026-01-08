// src/modules/workflows/WorkflowModule.tsx
// FINAL — Instruction-Only Workflow UI (Production Safe)
// Fixes:
// 1) Steps panel scroll (min-h-0 + overflow-hidden + h-full)
// 2) Add Step builder stays visible (sticky footer)
// 3) Delete workflow restored (button + handler)
// 4) “When to start workflow” trigger UI restored (always/keyword/intent)
// 5) Selecting a workflow also loads form fields (handleSelectWorkflow)
// 6) Keeps your existing store API usage (no direct supabase calls)

import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Save,
  Trash2,
  Workflow as WorkflowIcon,
  Wand2,
  Pencil,
} from "lucide-react";

import { useWorkflowStore } from "../../state/useWorkflowStore";
import { useOrganizationStore } from "../../state/useOrganizationStore";
import { WorkflowSimulator } from "./WorkflowSimulator";

import type { Workflow, WorkflowStep } from "../../types/database";

/* ------------------------------------------------------------------ */
/* TYPES                                                              */
/* ------------------------------------------------------------------ */

type TriggerType = "keyword" | "intent" | "always";
type ModeType = "smart" | "strict";

type WorkflowFormState = {
  name: string;
  description: string;
  mode: ModeType;
  trigger_type: TriggerType;
  keywords: string;
  intents: string;
  is_active: boolean;
};

type StepDraft = {
  ai_action: "instruction";
  instruction_text: string;
};

/* ------------------------------------------------------------------ */
/* HELPERS                                                            */
/* ------------------------------------------------------------------ */

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function renderStepSummary(step: WorkflowStep) {
  return (
    <>
      <div className="font-medium">Assistant Guidance</div>
      <div className="text-sm text-slate-600 line-clamp-4">
        {safeString((step as any)?.action?.instruction_text) || "—"}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* COMPONENT                                                          */
/* ------------------------------------------------------------------ */

export function WorkflowModule() {
  const { activeOrganization } = useOrganizationStore();

  const {
    workflows,
    steps,
    loading,
    saving,
    error,
    selectedWorkflow,
    setSelectedWorkflow,

    fetchWorkflows,
    fetchWorkflowSteps,

    saveWorkflow,
    deleteWorkflow,

    addStep,
    updateStep,
    deleteStep,

    cloneWorkflow,
    generateWorkflowFromDescription,
  } = useWorkflowStore();

  const [form, setForm] = useState<WorkflowFormState>({
    name: "",
    description: "",
    mode: "smart",
    trigger_type: "always",
    keywords: "",
    intents: "",
    is_active: true,
  });

  const [aiDescription, setAiDescription] = useState("");

  const [newStep, setNewStep] = useState<StepDraft | null>(null);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [stepDraft, setStepDraft] = useState<StepDraft | null>(null);

  const [showSimulator, setShowSimulator] = useState(false);

  const workflowId = selectedWorkflow?.id ?? null;

  const workflowSteps: WorkflowStep[] = useMemo(() => {
    if (!workflowId) return [];
    return steps[workflowId] ?? [];
  }, [steps, workflowId]);

  /* ------------------------------------------------------------------ */
  /* LOAD                                                               */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (!activeOrganization?.id) return;
    fetchWorkflows().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrganization?.id]);

  useEffect(() => {
    if (!workflowId) return;
    fetchWorkflowSteps(workflowId).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId]);

  /* ------------------------------------------------------------------ */
  /* UI CLASSES                                                         */
  /* ------------------------------------------------------------------ */

  const inputClass =
    "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500";
  const labelClass = "text-xs font-medium text-slate-600";
  const cardClass = "rounded-xl border border-slate-200 bg-white";

  /* ------------------------------------------------------------------ */
  /* HELPERS                                                            */
  /* ------------------------------------------------------------------ */

  const resetFormForNew = () => {
    setSelectedWorkflow(null);
    setForm({
      name: "",
      description: "",
      mode: "smart",
      trigger_type: "always",
      keywords: "",
      intents: "",
      is_active: true,
    });
    setAiDescription("");
    setNewStep(null);
    setEditingStepId(null);
    setStepDraft(null);
  };

  const buildTriggerJson = () => {
    const base: any = { type: form.trigger_type };

    if (form.trigger_type === "keyword") {
      base.keywords = form.keywords
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    }

    if (form.trigger_type === "intent") {
      base.intents = form.intents
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    }

    return base;
  };

  const handleSelectWorkflow = (wf: Workflow) => {
    setSelectedWorkflow(wf);

    const trig: any = (wf as any)?.trigger ?? {};

    setForm({
      name: safeString((wf as any)?.name),
      description: safeString((wf as any)?.description),
      mode: ((wf as any)?.mode as ModeType) ?? "smart",
      trigger_type: (trig.type as TriggerType) ?? "always",
      keywords: Array.isArray(trig.keywords) ? trig.keywords.join(", ") : "",
      intents: Array.isArray(trig.intents) ? trig.intents.join(", ") : "",
      is_active: typeof (wf as any)?.is_active === "boolean" ? (wf as any).is_active : true,
    });

    setNewStep(null);
    setEditingStepId(null);
    setStepDraft(null);
  };

  /* ------------------------------------------------------------------ */
  /* WORKFLOW ACTIONS                                                   */
  /* ------------------------------------------------------------------ */

  const handleSaveWorkflow = async () => {
    const id = await saveWorkflow({
      id: selectedWorkflow?.id,
      name: form.name,
      description: form.description,
      trigger: buildTriggerJson(),
      mode: form.mode,
      is_active: form.is_active,
    });

    if (id) {
      await fetchWorkflows();
      const wf = useWorkflowStore.getState().workflows.find((w) => w.id === id);
      if (wf) handleSelectWorkflow(wf);
    }
  };

  const handleDeleteWorkflow = async () => {
    if (!selectedWorkflow) return;
    const ok = window.confirm(`Delete workflow "${selectedWorkflow.name}"?`);
    if (!ok) return;

    await deleteWorkflow(selectedWorkflow.id);
    setSelectedWorkflow(null);
    setNewStep(null);
    setEditingStepId(null);
    setStepDraft(null);

    await fetchWorkflows();
  };

  const handleCloneWorkflow = async () => {
    if (!selectedWorkflow) return;
    const newId = await cloneWorkflow(selectedWorkflow.id);
    if (!newId) return;

    await fetchWorkflows();
    const wf = useWorkflowStore.getState().workflows.find((w) => w.id === newId);
    if (wf) handleSelectWorkflow(wf);

    await fetchWorkflowSteps(newId);
  };

  /* ------------------------------------------------------------------ */
  /* RENDER                                                             */
  /* ------------------------------------------------------------------ */

  return (
    <div className="h-full w-full overflow-hidden bg-slate-50">
      <div className="grid h-full grid-cols-[300px,1fr,380px] gap-8 px-8 py-6 overflow-hidden">
        {/* ============================================================ */}
        {/* LEFT — WORKFLOWS                                             */}
        {/* ============================================================ */}
        <aside className={`${cardClass} flex flex-col h-full overflow-hidden`}>
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <WorkflowIcon size={16} /> Workflows
            </h2>
            <button
              onClick={resetFormForNew}
              className="text-xs border border-slate-300 px-2 py-1 rounded hover:bg-slate-50"
            >
              <span className="inline-flex items-center gap-1">
                <Plus size={12} /> New
              </span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            {loading && (
              <div className="px-4 py-6 text-sm text-slate-500">Loading…</div>
            )}

            {!loading && workflows.length === 0 && (
              <div className="px-4 py-6 text-sm text-slate-500">
                No workflows yet. Click <b>New</b>.
              </div>
            )}

            {workflows.map((wf) => (
              <button
                key={wf.id}
                onClick={() => handleSelectWorkflow(wf)}
                className={`w-full px-4 py-3 text-left border-b border-slate-200 ${
                  selectedWorkflow?.id === wf.id ? "bg-blue-50" : "hover:bg-slate-50"
                }`}
              >
                <div className="font-medium text-slate-900">{wf.name}</div>
                <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                  {(wf as any).description || "No description"}
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* ============================================================ */}
        {/* CENTER — WORKFLOW FORM                                       */}
        {/* ============================================================ */}
        <main className={`${cardClass} flex flex-col h-full overflow-hidden`}>
          <div className="border-b px-6 py-4 flex justify-between items-center">
            <div className="text-lg font-semibold">
              {selectedWorkflow ? "Edit Workflow" : "New Workflow"}
            </div>

            <div className="flex items-center gap-2">
              {selectedWorkflow && (
                <>
                  <button
                    onClick={() => setShowSimulator(true)}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
                  >
                    🧪 Test
                  </button>

                  <button
                    onClick={handleCloneWorkflow}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
                  >
                    Clone
                  </button>

                  <button
                    onClick={handleDeleteWorkflow}
                    className="rounded-md border border-red-300 text-red-600 px-3 py-2 text-sm hover:bg-red-50"
                  >
                    Delete
                  </button>
                </>
              )}

              <button
                onClick={handleSaveWorkflow}
                disabled={!form.name.trim() || saving}
                className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2 disabled:opacity-50"
              >
                <Save size={14} /> Save
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6 min-h-0">
            <div>
              <label className={labelClass}>Workflow Name</label>
              <input
                className={inputClass}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. New Car Enquiry"
              />
            </div>

            <div>
              <label className={labelClass}>Task Description</label>
              <textarea
                className={`${inputClass} h-24`}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What should the assistant achieve with this workflow?"
              />
            </div>

            {/* WHEN TO START WORKFLOW */}
            <section className="border rounded-lg p-4 space-y-3">
              <h4 className="text-sm font-semibold">When should this workflow start?</h4>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Mode</label>
                  <select
                    value={form.mode}
                    onChange={(e) =>
                      setForm({ ...form, mode: e.target.value as ModeType })
                    }
                    className={inputClass}
                  >
                    <option value="smart">Smart (AI decides next step)</option>
                    <option value="strict">Strict (step-by-step)</option>
                  </select>
                </div>

                <div className="flex items-end gap-2">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    />
                    Active
                  </label>
                </div>
              </div>

              <div>
                <label className={labelClass}>Trigger Type</label>
                <select
                  value={form.trigger_type}
                  onChange={(e) =>
                    setForm({ ...form, trigger_type: e.target.value as TriggerType })
                  }
                  className={inputClass}
                >
                  <option value="always">Always</option>
                  <option value="keyword">When message contains keywords</option>
                  <option value="intent">When AI detects intent</option>
                </select>
              </div>

              {form.trigger_type === "keyword" && (
                <div>
                  <label className={labelClass}>Keywords (comma-separated)</label>
                  <input
                    className={inputClass}
                    value={form.keywords}
                    onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                    placeholder="e.g. harrier ev, interested, booking, test drive"
                  />
                  <div className="text-xs text-slate-500 mt-1">
                    Example: add <b>harrier ev</b> so workflow starts when customer mentions it.
                  </div>
                </div>
              )}

              {form.trigger_type === "intent" && (
                <div>
                  <label className={labelClass}>Intents (comma-separated)</label>
                  <input
                    className={inputClass}
                    value={form.intents}
                    onChange={(e) => setForm({ ...form, intents: e.target.value })}
                    placeholder="e.g. vehicle_interest, ev_interest"
                  />
                  <div className="text-xs text-slate-500 mt-1">
                    Must match the intent labels you configured in workflow trigger.
                  </div>
                </div>
              )}
            </section>

            {/* AI GENERATOR */}
            <details className="border rounded p-4">
              <summary className="cursor-pointer font-semibold flex items-center gap-2">
                <Wand2 size={16} /> Generate Workflow with AI (optional)
              </summary>

              <textarea
                className={`${inputClass} h-24 mt-3`}
                value={aiDescription}
                onChange={(e) => setAiDescription(e.target.value)}
                placeholder="Describe the workflow in plain English…"
              />

              <button
                onClick={async () => {
                  const desc = aiDescription.trim();
                  if (!desc) return;

                  const id = await generateWorkflowFromDescription(desc);
                  if (id) {
                    await fetchWorkflows();
                    const wf = useWorkflowStore.getState().workflows.find((w) => w.id === id);
                    if (wf) handleSelectWorkflow(wf);
                    await fetchWorkflowSteps(id);
                    setAiDescription("");
                  }
                }}
                className="mt-3 bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
                disabled={saving || !aiDescription.trim()}
              >
                Generate
              </button>

              <div className="mt-2 text-xs text-slate-500">
                This creates a new workflow + steps automatically.
              </div>
            </details>

            {error && (
              <div className="text-sm text-red-600 border border-red-200 bg-red-50 p-3 rounded">
                {error}
              </div>
            )}
          </div>
        </main>

        {/* ============================================================ */}
        {/* RIGHT — STEPS                                                 */}
        {/* ============================================================ */}
        <aside className={`${cardClass} flex flex-col h-full overflow-hidden`}>
          <div className="border-b px-4 py-3 flex justify-between items-center">
            <h3 className="font-semibold">Steps ({workflowSteps.length})</h3>

            {selectedWorkflow && (
              <button
                onClick={() =>
                  setNewStep({ ai_action: "instruction", instruction_text: "" })
                }
                className="bg-blue-600 text-white text-xs px-3 py-1 rounded hover:bg-blue-700"
              >
                + Add Step
              </button>
            )}
          </div>

          {/* Steps list (scrollable) */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            {workflowSteps.length === 0 && (
              <div className="text-sm text-slate-500">
                No steps yet. Add one to begin.
              </div>
            )}

            {workflowSteps.map((step, index) => {
              const isEditing = editingStepId === step.id;

              return (
                <div key={step.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex justify-between items-center text-xs text-slate-500">
                    Stage {index + 1}
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingStepId(step.id);
                          setStepDraft({
                            ai_action: "instruction",
                            instruction_text: safeString((step as any)?.action?.instruction_text),
                          });
                        }}
                        className="hover:text-blue-600"
                      >
                        <Pencil size={12} />
                      </button>

                      <button
                        onClick={() => {
                          if (!workflowId) return;
                          deleteStep(workflowId, step.id);
                        }}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {!isEditing ? (
                    <div className="mt-3 rounded-lg bg-slate-50 p-3">
                      {renderStepSummary(step)}
                    </div>
                  ) : (
                    <div className="mt-3 space-y-2">
                      <textarea
                        className={`${inputClass} h-24`}
                        value={stepDraft?.instruction_text ?? ""}
                        onChange={(e) =>
                          setStepDraft((p) =>
                            p ? { ...p, instruction_text: e.target.value } : p
                          )
                        }
                      />

                      <div className="flex items-center gap-2">
                        <button
                          onClick={async () => {
                            if (!stepDraft) return;
                            await updateStep(step.id, stepDraft);
                            setEditingStepId(null);
                            setStepDraft(null);
                            if (workflowId) await fetchWorkflowSteps(workflowId);
                          }}
                          className="bg-blue-600 text-white px-3 py-2 rounded hover:bg-blue-700"
                        >
                          Save
                        </button>

                        <button
                          onClick={() => {
                            setEditingStepId(null);
                            setStepDraft(null);
                          }}
                          className="border border-slate-300 px-3 py-2 rounded hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Sticky Add Step builder (keeps button visible) */}
          {newStep && (
            <div className="border-t p-4 space-y-3 bg-white sticky bottom-0 shadow-[0_-4px_10px_rgba(0,0,0,0.06)]">
              <textarea
                className={`${inputClass} h-24`}
                placeholder="What should the assistant do at this stage?"
                value={newStep.instruction_text}
                onChange={(e) =>
                  setNewStep({
                    ...newStep,
                    instruction_text: e.target.value,
                  })
                }
              />

              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    if (!workflowId) return;
                    await addStep(workflowId, newStep);
                    setNewStep(null);
                    await fetchWorkflowSteps(workflowId);
                  }}
                  className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
                >
                  Add Step
                </button>

                <button
                  onClick={() => setNewStep(null)}
                  className="px-4 py-2 rounded border border-slate-300 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>

      {showSimulator && selectedWorkflow && (
        <WorkflowSimulator
          workflow={selectedWorkflow}
          steps={workflowSteps}
          onClose={() => setShowSimulator(false)}
        />
      )}
    </div>
  );
}