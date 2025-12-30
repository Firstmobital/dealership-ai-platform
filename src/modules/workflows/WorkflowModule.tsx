// src/modules/workflows/WorkflowModule.tsx
// FINAL — Instruction-Only Workflow UI (Production Safe)

import { useEffect, useState } from "react";
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
import { useSubOrganizationStore } from "../../state/useSubOrganizationStore";
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
      <div className="text-sm text-slate-600">
        {safeString(step.action?.instruction_text) || "—"}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* COMPONENT                                                          */
/* ------------------------------------------------------------------ */

export function WorkflowModule() {
  const { currentOrganization } = useOrganizationStore();
  const { activeSubOrg } = useSubOrganizationStore();

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
  const workflowSteps: WorkflowStep[] =
    workflowId && steps[workflowId] ? steps[workflowId] : [];

  /* ------------------------------------------------------------------ */
  /* LOAD                                                               */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (!currentOrganization?.id) return;
    fetchWorkflows().catch(console.error);
  }, [currentOrganization?.id, activeSubOrg?.id]);

  useEffect(() => {
    if (!workflowId) return;
    fetchWorkflowSteps(workflowId).catch(console.error);
  }, [workflowId]);

  /* ------------------------------------------------------------------ */
  /* HELPERS                                                            */
  /* ------------------------------------------------------------------ */

  const inputClass =
    "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500";
  const labelClass = "text-xs font-medium text-slate-600";
  const cardClass = "rounded-xl border border-slate-200 bg-white";

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
      const wf = useWorkflowStore
        .getState()
        .workflows.find((w) => w.id === id);
      if (wf) setSelectedWorkflow(wf);
    }
  };

  /* ------------------------------------------------------------------ */
  /* RENDER                                                             */
  /* ------------------------------------------------------------------ */

  return (
    <div className="h-full w-full overflow-hidden bg-slate-50">
      <div className="grid h-full grid-cols-[280px,1fr,360px] gap-6 px-6 py-6">
        {/* LEFT — WORKFLOWS */}
        <aside className={`${cardClass} flex flex-col`}>
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <WorkflowIcon size={16} /> Workflows
            </h2>
            <button
              onClick={resetFormForNew}
              className="text-xs border px-2 py-1 rounded"
            >
              <Plus size={12} /> New
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {workflows.map((wf) => (
              <button
                key={wf.id}
                onClick={() => setSelectedWorkflow(wf)}
                className={`w-full px-4 py-3 text-left border-b ${
                  selectedWorkflow?.id === wf.id
                    ? "bg-blue-50"
                    : "hover:bg-slate-50"
                }`}
              >
                <div className="font-medium">{wf.name}</div>
                <div className="text-xs text-slate-500">
                  {(wf as any).description || "No description"}
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* CENTER — WORKFLOW FORM */}
        <main className={`${cardClass} flex flex-col`}>
          <div className="border-b px-6 py-4 flex justify-between items-center">
            <div className="text-lg font-semibold">
              {selectedWorkflow ? "Edit Workflow" : "New Workflow"}
            </div>
            <button
              onClick={handleSaveWorkflow}
              disabled={!form.name.trim() || saving}
              className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2 disabled:opacity-50"
            >
              <Save size={14} /> Save
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div>
              <label className={labelClass}>Workflow Name</label>
              <input
                className={inputClass}
                value={form.name}
                onChange={(e) =>
                  setForm({ ...form, name: e.target.value })
                }
              />
            </div>

            <div>
              <label className={labelClass}>Task Description</label>
              <textarea
                className={`${inputClass} h-24`}
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </div>

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
                  const id =
                    await generateWorkflowFromDescription(aiDescription);
                  if (id) {
                    await fetchWorkflows();
                    setAiDescription("");
                  }
                }}
                className="mt-3 bg-blue-600 text-white px-4 py-2 rounded"
              >
                Generate
              </button>
            </details>

            {error && (
              <div className="text-sm text-red-600 border border-red-200 bg-red-50 p-3 rounded">
                {error}
              </div>
            )}
          </div>
        </main>

        {/* RIGHT — STEPS */}
        <aside className={`${cardClass} flex flex-col`}>
          <div className="border-b px-4 py-3 flex justify-between">
            <h3 className="font-semibold">Steps ({workflowSteps.length})</h3>
            {selectedWorkflow && (
              <button
                onClick={() =>
                  setNewStep({
                    ai_action: "instruction",
                    instruction_text: "",
                  })
                }
                className="bg-blue-600 text-white text-xs px-3 py-1 rounded"
              >
                + Add Step
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {workflowSteps.map((step, index) => {
              const isEditing = editingStepId === step.id;

              return (
                <div
                  key={step.id}
                  className="border rounded p-3 bg-white"
                >
                  <div className="flex justify-between items-center text-xs text-slate-500">
                    Stage {index + 1}
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingStepId(step.id);
                          setStepDraft({
                            ai_action: "instruction",
                            instruction_text: safeString(
                              step.action?.instruction_text
                            ),
                          });
                        }}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={() =>
                          deleteStep(workflowId!, step.id)
                        }
                        className="text-red-500"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {!isEditing ? (
                    <div className="mt-2 bg-slate-50 p-3 rounded">
                      {renderStepSummary(step)}
                    </div>
                  ) : (
                    <div className="mt-3 space-y-2">
                      <textarea
                        className={`${inputClass} h-24`}
                        value={stepDraft?.instruction_text}
                        onChange={(e) =>
                          setStepDraft((p) => ({
                            ...p!,
                            instruction_text: e.target.value,
                          }))
                        }
                      />

                      <button
                        onClick={async () => {
                          if (!stepDraft) return;
                          await updateStep(step.id, stepDraft);
                          setEditingStepId(null);
                          setStepDraft(null);
                        }}
                        className="bg-blue-600 text-white px-3 py-2 rounded"
                      >
                        Save
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {newStep && (
            <div className="border-t p-4 space-y-3">
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

              <button
                onClick={async () => {
                  await addStep(workflowId!, newStep);
                  setNewStep(null);
                }}
                className="w-full bg-blue-600 text-white py-2 rounded"
              >
                Add Step
              </button>
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
