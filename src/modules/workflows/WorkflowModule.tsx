// src/modules/workflows/WorkflowModule.tsx
// FULL & FINAL — Tier 7
// Inline step editing + Smart/Strict compatible
// Uses useWorkflowStore (no direct supabase calls)

import { useEffect, useState } from "react";
import {
  Plus,
  Save,
  Trash2,
  Workflow as WorkflowIcon,
  Wand2,
  GripVertical,
  Pencil,
  X,
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
  ai_action: string;
  instruction_text?: string;
  expected_user_input?: string;
  metadata?: any;
};

/* ------------------------------------------------------------------ */
/* HELPERS                                                            */
/* ------------------------------------------------------------------ */

function renderStepSummary(step: WorkflowStep) {
  const action: any = step.action ?? {};

  switch (action.ai_action) {
    case "ask_question":
      return (
        <>
          <div className="font-medium">Ask Question</div>
          <div className="text-sm text-slate-600">
            {action.instruction_text || "—"}
          </div>
        </>
      );

    case "give_information":
      return (
        <>
          <div className="font-medium">Give Information</div>
          <div className="text-sm text-slate-600">
            {action.instruction_text || "—"}
          </div>
        </>
      );

    case "save_user_response":
      return (
        <>
          <div className="font-medium">Save User Response</div>
          <div className="text-sm text-slate-600">
            Save as <code>{action.expected_user_input}</code>
          </div>
          {action.instruction_text && (
            <div className="text-xs text-slate-500 mt-1">
              Reply: {action.instruction_text}
            </div>
          )}
        </>
      );

    case "use_knowledge_base":
      return (
        <>
          <div className="font-medium">Search Knowledge Base</div>
          <div className="text-sm text-slate-600">
            {action.instruction_text || "—"}
          </div>
        </>
      );

    case "branch":
      return (
        <>
          <div className="font-medium">Branch Logic</div>
          <div className="text-sm text-slate-600">
            If <code>{action.metadata?.rule?.field}</code> =
            <code className="ml-1">{action.metadata?.rule?.value}</code> → go
            to step {action.metadata?.rule?.goto_step}
          </div>
        </>
      );

    case "end":
      return (
        <>
          <div className="font-medium">End Workflow</div>
          <div className="text-sm text-slate-600">
            {action.instruction_text || "Conversation ends"}
          </div>
        </>
      );

    default:
      return <div className="text-sm text-slate-500">Unknown step</div>;
  }
}
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
    reorderSteps,

    cloneWorkflow,

    generateWorkflowFromDescription,
  } = useWorkflowStore();

  const [form, setForm] = useState<WorkflowFormState>({
    name: "",
    description: "",
    mode: "smart",
    trigger_type: "keyword",
    keywords: "",
    intents: "",
    is_active: true,
  });

  // AI Generator
  const [aiDescription, setAiDescription] = useState("");

  // Step builder (create)
  const [newStep, setNewStep] = useState<StepDraft>({
    ai_action: "",
    instruction_text: "",
    expected_user_input: "",
    metadata: {},
  });

  // Inline step editing
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [stepDraft, setStepDraft] = useState<StepDraft | null>(null);

  // Drag/drop
  const [draggingStepId, setDraggingStepId] = useState<string | null>(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrganization?.id, activeSubOrg?.id]);

  useEffect(() => {
    if (!workflowId) return;
    fetchWorkflowSteps(workflowId).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId]);

  /* ------------------------------------------------------------------ */
  /* HELPERS                                                            */
  /* ------------------------------------------------------------------ */
  const inputClass =
    "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500";
  const labelClass = "text-xs font-medium text-slate-600";

  const cardClass = "rounded-xl border border-slate-200 bg-white";

  const resetFormForNew = () => {
    setSelectedWorkflow(null);
    setForm({
      name: "",
      description: "",
      mode: "smart",
      trigger_type: "keyword",
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

  const handleSelectWorkflow = (wf: Workflow) => {
    setSelectedWorkflow(wf);

    const trig: any = (wf as any).trigger || {};
    setForm({
      name: wf.name,
      description: (wf as any).description ?? "",
      mode: ((wf as any).mode as ModeType) ?? "smart",
      trigger_type: (trig.type as TriggerType) ?? "always",
      keywords: Array.isArray(trig.keywords) ? trig.keywords.join(", ") : "",
      intents: Array.isArray(trig.intents) ? trig.intents.join(", ") : "",
      is_active: (wf as any).is_active ?? true,
    });

    setEditingStepId(null);
    setStepDraft(null);
  };

  /* ------------------------------------------------------------------ */
  /* WORKFLOW ACTIONS                                                   */
  /* ------------------------------------------------------------------ */
  const handleSaveWorkflow = async () => {
    const trigger = buildTriggerJson();

    const id = await saveWorkflow({
      id: selectedWorkflow?.id,
      name: form.name,
      description: form.description,
      trigger,
      mode: form.mode,
      is_active: form.is_active,
    });

    if (id) {
      await fetchWorkflows();
      const wf = useWorkflowStore.getState().workflows.find((w) => w.id === id);
      if (wf) setSelectedWorkflow(wf);
    }
  };

  const handleDeleteWorkflow = async () => {
    if (!selectedWorkflow) return;
    if (!window.confirm(`Delete workflow "${selectedWorkflow.name}"?`)) return;

    await deleteWorkflow(selectedWorkflow.id);
    setSelectedWorkflow(null);
    await fetchWorkflows();
  };

  const handleCloneWorkflow = async () => {
    if (!selectedWorkflow) return;
    const newId = await cloneWorkflow(selectedWorkflow.id);
    if (!newId) return;

    await fetchWorkflows();
    const wf = useWorkflowStore.getState().workflows.find((w) => w.id === newId);
    if (wf) setSelectedWorkflow(wf);
    await fetchWorkflowSteps(newId);
  };

  /* ------------------------------------------------------------------ */
  /* AI GENERATOR (FIXED: uses store)                                   */
  /* ------------------------------------------------------------------ */
  const handleGenerateWithAI = async () => {
    const desc = aiDescription.trim();
    if (!desc) return;

    const newId = await generateWorkflowFromDescription(desc);
    if (!newId) return;

    await fetchWorkflows();
    const wf = useWorkflowStore.getState().workflows.find((w) => w.id === newId);
    if (wf) setSelectedWorkflow(wf);

    await fetchWorkflowSteps(newId);
    setAiDescription("");
  };

  /* ------------------------------------------------------------------ */
  /* RENDER (Shell + left + center)                                     */
  /* ------------------------------------------------------------------ */
  return (
    <div className="h-full w-full overflow-hidden bg-slate-50">
      <div className="grid h-full grid-cols-[280px,1fr,360px] gap-6 px-6 py-6 overflow-hidden">
        {/* ============================================================ */}
        {/* LEFT — WORKFLOW LIST                                         */}
        {/* ============================================================ */}
        <aside className={`${cardClass} flex flex-col overflow-hidden`}>
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div className="flex items-center gap-2">
              <WorkflowIcon size={18} className="text-blue-600" />
              <h2 className="text-sm font-semibold text-slate-900">
                Workflows
              </h2>
            </div>

            <button
              onClick={resetFormForNew}
              className="flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
            >
              <Plus size={14} />
              New
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {workflows.map((wf) => {
              const active = selectedWorkflow?.id === wf.id;
              return (
                <button
                  key={wf.id}
                  onClick={() => handleSelectWorkflow(wf)}
                  className={`w-full border-b px-4 py-3 text-left transition ${
                    active
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="text-sm font-semibold text-slate-900">
                    {wf.name}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                    {(wf as any).description || "No description"}
                  </div>

                  <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-600">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5">
                      {(wf as any).mode === "strict" ? "Strict" : "Smart"}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5">
                      {(wf as any).is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                </button>
              );
            })}

            {!loading && workflows.length === 0 && (
              <div className="px-4 py-6 text-sm text-slate-500">
                No workflows yet. Click <b>New</b>.
              </div>
            )}

            {loading && (
              <div className="px-4 py-6 text-sm text-slate-500">Loading…</div>
            )}
          </div>
        </aside>

        {/* ============================================================ */}
        {/* CENTER — WORKFLOW FORM                                       */}
        {/* ============================================================ */}
        <main className={`${cardClass} flex flex-col overflow-hidden`}>
          {/* Header */}
          <div className="border-b border-slate-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold text-slate-900">
                  {selectedWorkflow ? "Edit Workflow" : "New Workflow"}
                </div>
                <div className="text-xs text-slate-500">
                  Smart mode: AI chooses next step. Strict mode: step-by-step.
                </div>
              </div>

              <div className="flex items-center gap-2">
                {selectedWorkflow && (
                  <>
                    <button
                    onClick={() => setShowSimulator(true)}
                    className="rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100"
                    >
                      🧪 Test
                    </button>

                    <button
                      onClick={handleCloneWorkflow}
                      className="rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100"
                    >
                      Clone
                    </button>

                    <button
                      onClick={handleDeleteWorkflow}
                      className="rounded-md border border-red-300 px-3 py-2 text-xs text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </>
                )}

                <button
                  onClick={handleSaveWorkflow}
                  disabled={saving || !form.name.trim()}
                  className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  <Save size={16} />
                  Save
                </button>
              </div>
            </div>
          </div>

          {/* Body scroll */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            {/* FORM */}
            <section className="grid grid-cols-2 gap-4">
              {/* Name */}
              <div>
                <label className={labelClass}>Workflow Name</label>
                <input
                  value={form.name}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, name: e.target.value }))
                  }
                  className={inputClass}
                  placeholder="e.g. New car enquiry"
                />
              </div>

              {/* Mode */}
              <div>
                <label className={labelClass}>Mode</label>
                <select
                  value={form.mode}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, mode: e.target.value as ModeType }))
                  }
                  className={inputClass}
                >
                  <option value="smart">Smart (AI decides next step)</option>
                  <option value="strict">Strict (step-by-step)</option>
                </select>
              </div>

              {/* Description */}
              <div className="col-span-2">
                <label className={labelClass}>
                  Task Description (what should the agent do?)
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, description: e.target.value }))
                  }
                  className={`${inputClass} h-20`}
                  placeholder="e.g. Greet customer, understand requirement, suggest models, collect budget, book test drive."
                />
              </div>

              {/* Trigger Type */}
              <div>
                <label className={labelClass}>Trigger Type</label>
                <select
                  value={form.trigger_type}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      trigger_type: e.target.value as TriggerType,
                    }))
                  }
                  className={inputClass}
                >
                  <option value="always">Always</option>
                  <option value="keyword">Keyword</option>
                  <option value="intent">Intent</option>
                </select>
              </div>

              {/* is_active */}
              <div className="flex items-end gap-2">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, is_active: e.target.checked }))
                    }
                  />
                  Active
                </label>
              </div>

              {form.trigger_type === "keyword" && (
                <div className="col-span-2">
                  <label className={labelClass}>Keywords (comma-separated)</label>
                  <input
                    value={form.keywords}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, keywords: e.target.value }))
                    }
                    className={inputClass}
                    placeholder="e.g. price, emi, discount"
                  />
                </div>
              )}

              {form.trigger_type === "intent" && (
                <div className="col-span-2">
                  <label className={labelClass}>Intents (comma-separated)</label>
                  <input
                    value={form.intents}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, intents: e.target.value }))
                    }
                    className={inputClass}
                    placeholder="e.g. book_test_drive, service_booking"
                  />
                </div>
              )}
            </section>

            {/* AI GENERATOR */}
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold text-slate-900">
                  <Wand2 size={18} className="text-blue-600" />
                  Generate Workflow with AI
                </div>

                <button
                  onClick={handleGenerateWithAI}
                  disabled={saving || !aiDescription.trim()}
                  className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Generate
                </button>
              </div>

              <textarea
                value={aiDescription}
                onChange={(e) => setAiDescription(e.target.value)}
                className="mt-3 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 h-24"
                placeholder="Describe the workflow you want. Example: Handle a sales enquiry: ask model, budget, city, offer test drive, then end."
              />

              <div className="mt-2 text-xs text-slate-500">
                This will create a new workflow + steps automatically.
              </div>
            </section>

            {/* Error */}
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>
        </main>
        {/* ============================================================ */}
        {/* RIGHT — STEPS PANEL                                          */}
        {/* ============================================================ */}
        <aside className={`${cardClass} flex flex-col overflow-hidden`}>
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-900">
              Steps ({workflowSteps.length})
            </h3>

            {selectedWorkflow && (
              <button
                onClick={() =>
                  setNewStep({
                    ai_action: "ask_question",
                    instruction_text: "",
                    expected_user_input: "",
                    metadata: {},
                  })
                }
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                + Add Step
              </button>
            )}
          </div>

          {/* STEPS LIST */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {workflowSteps.length === 0 && (
              <p className="text-sm text-slate-500">
                No steps yet. Add one to begin.
              </p>
            )}

            {workflowSteps.map((step, index) => {
              const isEditing = editingStepId === step.id;
              const action: any = step.action ?? {};

              return (
                <div
                  key={step.id}
                  draggable
                  onDragStart={() => setDraggingStepId(step.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={async () => {
                    if (!draggingStepId || draggingStepId === step.id) return;

                    const ordered = [...workflowSteps];
                    const from = ordered.findIndex(
                      (s) => s.id === draggingStepId
                    );
                    const to = ordered.findIndex((s) => s.id === step.id);

                    const moved = ordered.splice(from, 1)[0];
                    ordered.splice(to, 0, moved);

                    await reorderSteps(
                      workflowId!,
                      ordered.map((s) => s.id)
                    );
                    setDraggingStepId(null);
                  }}
                  className="rounded-lg border border-slate-200 bg-white p-4"
                >
                  {/* HEADER */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <GripVertical size={14} />
                      Step {index + 1}
                    </div>

                    <div className="flex items-center gap-2">
                      {!isEditing && (
                        <button
                          onClick={() => {
                            setEditingStepId(step.id);
                            setStepDraft({ ...(step.action as any) });
                          }}
                          className="text-slate-500 hover:text-blue-600"
                        >
                          <Pencil size={14} />
                        </button>
                      )}

                      <button
                        onClick={() =>
                          selectedWorkflow &&
                          deleteStep(selectedWorkflow.id, step.id)
                        }
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* BODY */}
                  {!isEditing ? (
                    <div className="mt-2 rounded-md bg-slate-50 p-3">
                      {renderStepSummary(step)}
                    </div>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {/* ACTION TYPE */}
                      <div>
                        <label className={labelClass}>Action Type</label>
                        <select
                          value={stepDraft?.ai_action}
                          onChange={(e) =>
                            setStepDraft((p) => ({
                              ...p!,
                              ai_action: e.target.value,
                            }))
                          }
                          className={inputClass}
                        >
                          <option value="ask_question">Ask Question</option>
                          <option value="give_information">
                            Give Information
                          </option>
                          <option value="save_user_response">
                            Save User Response
                          </option>
                          <option value="use_knowledge_base">
                            Search Knowledge Base
                          </option>
                          <option value="branch">Branch Logic</option>
                          <option value="end">End Workflow</option>
                        </select>
                      </div>

                      {/* INSTRUCTION */}
                      <div>
                        <label className={labelClass}>Instruction</label>
                        <textarea
                          value={stepDraft?.instruction_text ?? ""}
                          onChange={(e) =>
                            setStepDraft((p) => ({
                              ...p!,
                              instruction_text: e.target.value,
                            }))
                          }
                          className={`${inputClass} h-20`}
                        />
                      </div>

                      {/* SAVE USER RESPONSE */}
                      {stepDraft?.ai_action === "save_user_response" && (
                        <div>
                          <label className={labelClass}>Variable Key</label>
                          <input
                            value={stepDraft?.expected_user_input ?? ""}
                            onChange={(e) =>
                              setStepDraft((p) => ({
                                ...p!,
                                expected_user_input: e.target.value,
                              }))
                            }
                            className={inputClass}
                            placeholder="e.g. preferred_model"
                          />
                        </div>
                      )}

                      {/* BRANCH */}
                      {stepDraft?.ai_action === "branch" && (
                        <>
                          <div>
                            <label className={labelClass}>
                              Variable to check
                            </label>
                            <input
                              value={
                                stepDraft?.metadata?.rule?.field ?? ""
                              }
                              onChange={(e) =>
                                setStepDraft((p) => ({
                                  ...p!,
                                  metadata: {
                                    rule: {
                                      ...(p?.metadata?.rule ?? {}),
                                      field: e.target.value,
                                    },
                                  },
                                }))
                              }
                              className={inputClass}
                            />
                          </div>

                          <div>
                            <label className={labelClass}>
                              Expected value
                            </label>
                            <input
                              value={
                                stepDraft?.metadata?.rule?.value ?? ""
                              }
                              onChange={(e) =>
                                setStepDraft((p) => ({
                                  ...p!,
                                  metadata: {
                                    rule: {
                                      ...(p?.metadata?.rule ?? {}),
                                      value: e.target.value,
                                    },
                                  },
                                }))
                              }
                              className={inputClass}
                            />
                          </div>

                          <div>
                            <label className={labelClass}>Go to step #</label>
                            <input
                              type="number"
                              min={1}
                              value={
                                stepDraft?.metadata?.rule?.goto_step ?? ""
                              }
                              onChange={(e) =>
                                setStepDraft((p) => ({
                                  ...p!,
                                  metadata: {
                                    rule: {
                                      ...(p?.metadata?.rule ?? {}),
                                      goto_step: Number(e.target.value),
                                    },
                                  },
                                }))
                              }
                              className={inputClass}
                            />
                          </div>
                        </>
                      )}

                      {/* ACTIONS */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={async () => {
                            if (!stepDraft) return;
                            await updateStep(step.id, stepDraft);
                            setEditingStepId(null);
                            setStepDraft(null);
                            await fetchWorkflowSteps(workflowId!);
                          }}
                          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                        >
                          Save
                        </button>

                        <button
                          onClick={() => {
                            setEditingStepId(null);
                            setStepDraft(null);
                          }}
                          className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
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

          {/* ADD NEW STEP BUILDER */}
          {selectedWorkflow && newStep.ai_action && (
            <div className="border-t border-slate-200 p-4 space-y-3">
              <h4 className="text-sm font-semibold">Add New Step</h4>

              <select
                value={newStep.ai_action}
                onChange={(e) =>
                  setNewStep((p) => ({
                    ...p,
                    ai_action: e.target.value,
                  }))
                }
                className={inputClass}
              >
                <option value="ask_question">Ask Question</option>
                <option value="give_information">Give Information</option>
                <option value="save_user_response">Save User Response</option>
                <option value="use_knowledge_base">
                  Search Knowledge Base
                </option>
                <option value="branch">Branch Logic</option>
                <option value="end">End Workflow</option>
              </select>

              <textarea
                placeholder="Instruction text"
                value={newStep.instruction_text ?? ""}
                onChange={(e) =>
                  setNewStep((p) => ({
                    ...p,
                    instruction_text: e.target.value,
                  }))
                }
                className={`${inputClass} h-20`}
              />

              {newStep.ai_action === "save_user_response" && (
                <input
                  placeholder="Variable key"
                  value={newStep.expected_user_input ?? ""}
                  onChange={(e) =>
                    setNewStep((p) => ({
                      ...p,
                      expected_user_input: e.target.value,
                    }))
                  }
                  className={inputClass}
                />
              )}

              <button
                onClick={async () => {
                  await addStep(workflowId!, newStep);
                  setNewStep({
                    ai_action: "",
                    instruction_text: "",
                    expected_user_input: "",
                    metadata: {},
                  });
                }}
                className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
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
