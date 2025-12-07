// src/modules/workflows/WorkflowModule.tsx

import { useEffect, useState } from "react";
import {
  PlusCircle,
  Save,
  Trash,
  Workflow as WorkflowIcon,
  Play,
  Copy,
  Wand2,
  RefreshCcw,
  AlertTriangle,
} from "lucide-react";

import { useOrganizationStore } from "../../state/useOrganizationStore";
import { useSubOrganizationStore } from "../../state/useSubOrganizationStore";
import { useWorkflowStore } from "../../state/useWorkflowStore";
import { supabase } from "../../lib/supabaseClient";

import type { WorkflowStep } from "../../types/database";

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

  // step builder fields
  newActionType: string;
  newActionText: string;
  newSaveKey: string;
  branchField: string;
  branchValue: string;
  branchGoto: string;
};

export function WorkflowModule() {
  const { currentOrganization } = useOrganizationStore();
  const { activeSubOrg } = useSubOrganizationStore();

  const {
    workflows,
    selectedWorkflow,
    setSelectedWorkflow,
    fetchWorkflows,
    fetchWorkflowSteps,
    fetchWorkflowLogs,
    saveWorkflow,
    deleteWorkflow,
    addStep,
    deleteStep,
    reorderSteps,
    cloneWorkflow,
    steps,
    logs,
    loading,
    saving,
    error,
  } = useWorkflowStore();

  const [form, setForm] = useState<WorkflowFormState>({
    name: "",
    description: "",
    mode: "smart",
    trigger_type: "keyword",
    keywords: "",
    intents: "",
    is_active: true,

    newActionType: "",
    newActionText: "",
    newSaveKey: "",
    branchField: "",
    branchValue: "",
    branchGoto: "",
  });

  const [aiDescription, setAiDescription] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [draggingStepId, setDraggingStepId] = useState<string | null>(null);

  /* ----------------------------------------------------------------------------
    LOAD WORKFLOWS
  ---------------------------------------------------------------------------- */
  useEffect(() => {
    if (currentOrganization) {
      fetchWorkflows().catch(console.error);
    }
  }, [currentOrganization?.id, activeSubOrg?.id]);

  /* ----------------------------------------------------------------------------
    LOAD STEPS + LOGS WHEN WORKFLOW SELECTED
  ---------------------------------------------------------------------------- */
  useEffect(() => {
    if (selectedWorkflow?.id) {
      fetchWorkflowSteps(selectedWorkflow.id).catch(console.error);
      fetchWorkflowLogs(selectedWorkflow.id).catch(console.error);
    }
  }, [selectedWorkflow?.id]);

  const workflowSteps: WorkflowStep[] =
    selectedWorkflow && steps[selectedWorkflow.id]
      ? steps[selectedWorkflow.id]
      : [];

  /* ----------------------------------------------------------------------------
    RESET STATE FOR NEW WORKFLOW
  ---------------------------------------------------------------------------- */
  const resetForm = () => {
    setForm({
      name: "",
      description: "",
      mode: "smart",
      trigger_type: "keyword",
      keywords: "",
      intents: "",
      is_active: true,

      newActionType: "",
      newActionText: "",
      newSaveKey: "",
      branchField: "",
      branchValue: "",
      branchGoto: "",
    });

    setSelectedWorkflow(null);
  };

  /* ----------------------------------------------------------------------------
    POPULATE FORM FOR EDIT MODE
  ---------------------------------------------------------------------------- */
  const handleSelectWorkflow = (wf: any) => {
    setSelectedWorkflow(wf);

    const trig = wf.trigger || {};
    setForm((prev) => ({
      ...prev,
      name: wf.name,
      description: wf.description ?? "",
      mode: (wf.mode as ModeType) ?? "smart",
      trigger_type: (trig.type as TriggerType) ?? "keyword",
      keywords: Array.isArray(trig.keywords) ? trig.keywords.join(", ") : "",
      intents: Array.isArray(trig.intents) ? trig.intents.join(", ") : "",
      is_active: wf.is_active ?? true,

      newActionType: "",
      newActionText: "",
      newSaveKey: "",
      branchField: "",
      branchValue: "",
      branchGoto: "",
    }));
  };

  /* ----------------------------------------------------------------------------
    TRIGGER JSON BUILDER
  ---------------------------------------------------------------------------- */
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

  /* ----------------------------------------------------------------------------
    SAVE WORKFLOW
  ---------------------------------------------------------------------------- */
  const handleSaveWorkflowClick = async () => {
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

  /* ----------------------------------------------------------------------------
    AI WORKFLOW GENERATOR
  ---------------------------------------------------------------------------- */
  const handleGenerateWithAI = async () => {
    if (!aiDescription.trim() || !currentOrganization) return;

    try {
      setAiGenerating(true);

      const { data, error } = await supabase.functions.invoke(
        "workflow-generator",
        {
          body: {
            organization_id: currentOrganization.id,
            description: aiDescription.trim(),
          },
        }
      );

      if (error) return;

      const wf = data?.workflow;
      if (!wf) return;

      const newId = await saveWorkflow({
        name: wf.name,
        description: wf.description,
        trigger: wf.trigger,
        mode: (wf.mode as ModeType) ?? "smart",
        is_active: wf.is_active ?? true,
      });

      if (!newId) return;

      if (Array.isArray(wf.steps)) {
        for (const s of wf.steps) {
          await addStep(newId, {
            ai_action: s.ai_action,
            instruction_text: s.instruction_text ?? "",
            expected_user_input: s.expected_user_input ?? "",
            metadata: s.metadata ?? {},
          });
        }
      }

      await fetchWorkflows();
      const created = useWorkflowStore
        .getState()
        .workflows.find((w) => w.id === newId);

      if (created) {
        setSelectedWorkflow(created);
        await fetchWorkflowSteps(newId);
        await fetchWorkflowLogs(newId);
      }

      setAiDescription("");
    } finally {
      setAiGenerating(false);
    }
  };

  /* ----------------------------------------------------------------------------
    BRANCH VALIDATION
  ---------------------------------------------------------------------------- */
  const branchIssues = (step: WorkflowStep, maxStep: number) => {
    const action: any = step.action ?? {};
    if (action.ai_action !== "branch") return null;

    const rule = action.metadata?.rule;
    if (!rule) return "Missing branch rule configuration.";

    if (!rule.goto_step || rule.goto_step < 1 || rule.goto_step > maxStep) {
      return `Invalid goto_step (${rule.goto_step}). Must be between 1 and ${maxStep}.`;
    }

    return null;
  };

  /* ----------------------------------------------------------------------------
    DRAG & DROP ORDERING
  ---------------------------------------------------------------------------- */
  const handleDragStart = (stepId: string) => {
    setDraggingStepId(stepId);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) =>
    e.preventDefault();

  const handleDrop = async (targetId: string) => {
    if (!draggingStepId || !selectedWorkflow) return;

    if (draggingStepId === targetId) {
      setDraggingStepId(null);
      return;
    }

    const list = [...workflowSteps];

    const fromIndex = list.findIndex((s) => s.id === draggingStepId);
    const toIndex = list.findIndex((s) => s.id === targetId);

    if (fromIndex === -1 || toIndex === -1) return;

    const moved = list.splice(fromIndex, 1)[0];
    list.splice(toIndex, 0, moved);

    await reorderSteps(
      selectedWorkflow.id,
      list.map((s) => s.id as string)
    );

    setDraggingStepId(null);
  };

  /* ----------------------------------------------------------------------------
    CLONE WORKFLOW
  ---------------------------------------------------------------------------- */
  const handleCloneWorkflow = async () => {
    if (!selectedWorkflow) return;
    const newId = await cloneWorkflow(selectedWorkflow.id);
    if (!newId) return;

    await fetchWorkflows();

    const newWF = useWorkflowStore
      .getState()
      .workflows.find((w) => w.id === newId);

    if (newWF) {
      setSelectedWorkflow(newWF);
      await fetchWorkflowSteps(newId);
      await fetchWorkflowLogs(newId);
    }
  };

  /* ----------------------------------------------------------------------------
    SAVE STEP
  ---------------------------------------------------------------------------- */
  const handleSaveStep = async () => {
    if (!selectedWorkflow || !form.newActionType) return;

    const action: any = {
      ai_action: form.newActionType,
      instruction_text: form.newActionText ?? "",
    };

    if (form.newActionType === "save_user_response") {
      action.expected_user_input = form.newSaveKey;
    }

    if (form.newActionType === "branch") {
      action.metadata = {
        rule: {
          field: form.branchField,
          value: form.branchValue,
          goto_step: Number(form.branchGoto || "0"),
        },
      };
    }

    await addStep(selectedWorkflow.id, action);

    setForm((prev) => ({
      ...prev,
      newActionType: "",
      newActionText: "",
      newSaveKey: "",
      branchField: "",
      branchValue: "",
      branchGoto: "",
    }));
  };

  /* ----------------------------------------------------------------------------
    UI
  ---------------------------------------------------------------------------- */
  return (
    <div className="grid grid-cols-[260px,1fr,320px] gap-6 p-4">
      {/* ──────────────────────────────────────────────
         LEFT — WORKFLOW LIST
      ────────────────────────────────────────────── */}
      <aside className="rounded-xl border border-slate-700 bg-slate-900 flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
            <WorkflowIcon size={14} /> Workflows
          </h2>

          <button
            onClick={resetForm}
            className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
          >
            <PlusCircle size={14} /> New
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {workflows.map((wf) => (
            <button
              key={wf.id}
              onClick={() => handleSelectWorkflow(wf)}
              className={`flex w-full flex-col border-b border-slate-800 px-4 py-3 text-left text-slate-100 hover:bg-slate-800 ${
                selectedWorkflow?.id === wf.id ? "bg-slate-800" : ""
              }`}
            >
              <span className="text-sm font-medium">{wf.name}</span>
              <span className="text-xs text-slate-400">
                {wf.description || "No description"}
              </span>
              <span className="mt-1 text-[10px] uppercase text-slate-500">
                {wf.mode === "strict" ? "STRICT" : "SMART"} •{" "}
                {wf.is_active ? "Active" : "Inactive"}
              </span>
            </button>
          ))}
        </div>
      </aside>

      {/* ──────────────────────────────────────────────
         CENTER — FORM + STEPS
      ────────────────────────────────────────────── */}
      <main className="rounded-xl border border-slate-700 bg-slate-900 p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            {selectedWorkflow ? "Edit Workflow" : "New Workflow"}
          </h2>

          <div className="flex items-center gap-2">
            {selectedWorkflow && (
              <>
                <button
                  onClick={handleCloneWorkflow}
                  className="flex items-center gap-1 rounded-md bg-slate-800 px-3 py-1 text-xs text-slate-100 hover:bg-slate-700"
                >
                  <Copy size={14} /> Clone
                </button>

                <button
                  onClick={async () => {
                    if (
                      selectedWorkflow &&
                      window.confirm(
                        `Delete workflow "${selectedWorkflow.name}"?`
                      )
                    ) {
                      await deleteWorkflow(selectedWorkflow.id);
                      resetForm();
                    }
                  }}
                  className="flex items-center gap-1 rounded-md bg-red-900/60 px-3 py-1 text-xs text-red-100 hover:bg-red-800"
                >
                  <Trash size={14} /> Delete
                </button>
              </>
            )}

            <button
              onClick={handleSaveWorkflowClick}
              disabled={saving}
              className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              <Save size={16} /> Save
            </button>
          </div>
        </div>

        {/* Workflow Form */}
        <section className="grid grid-cols-2 gap-4">
          {/* Name */}
          <div>
            <label className="text-xs text-slate-400">Name</label>
            <input
              value={form.name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, name: e.target.value }))
              }
              className="mt-1 w-full rounded bg-slate-800 px-3 py-2 text-sm text-white"
            />
          </div>

          {/* Mode */}
          <div>
            <label className="text-xs text-slate-400">Mode</label>
            <select
              value={form.mode}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  mode: e.target.value as ModeType,
                }))
              }
              className="mt-1 w-full rounded bg-slate-800 px-3 py-2 text-sm text-white"
            >
              <option value="smart">Smart (AI flexible)</option>
              <option value="strict">Strict (step-by-step)</option>
            </select>
          </div>

          {/* Description */}
          <div className="col-span-2">
            <label className="text-xs text-slate-400">Description</label>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, description: e.target.value }))
              }
              className="mt-1 w-full rounded bg-slate-800 px-3 py-2 text-sm text-white h-20"
            />
          </div>

          {/* Trigger Type */}
          <div>
            <label className="text-xs text-slate-400">Trigger Type</label>
            <select
              value={form.trigger_type}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  trigger_type: e.target.value as TriggerType,
                }))
              }
              className="mt-1 w-full rounded bg-slate-800 px-3 py-2 text-sm text-white"
            >
              <option value="keyword">Keyword</option>
              <option value="intent">Intent</option>
              <option value="always">Always</option>
            </select>
          </div>

          {form.trigger_type === "keyword" && (
            <div>
              <label className="text-xs text-slate-400">
                Keywords (comma-separated)
              </label>
              <input
                value={form.keywords}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, keywords: e.target.value }))
                }
                className="mt-1 w-full rounded bg-slate-800 px-3 py-2 text-sm text-white"
              />
            </div>
          )}

          {form.trigger_type === "intent" && (
            <div>
              <label className="text-xs text-slate-400">
                Intents (comma-separated)
              </label>
              <input
                value={form.intents}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, intents: e.target.value }))
                }
                className="mt-1 w-full rounded bg-slate-800 px-3 py-2 text-sm text-white"
              />
            </div>
          )}
        </section>

        {/* AI GENERATOR SECTION */}
        <section className="rounded-lg border border-slate-700 bg-slate-800/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-slate-100">
              <Wand2 size={16} className="text-accent" />
              <span>Generate workflow with AI</span>
            </div>
            <button
              onClick={handleGenerateWithAI}
              disabled={aiGenerating || !aiDescription.trim()}
              className="flex items-center gap-2 rounded-md bg-accent px-3 py-1 text-xs text-white disabled:opacity-50"
            >
              <Play size={14} />
              {aiGenerating ? "Generating..." : "Generate"}
            </button>
          </div>

          <textarea
            value={aiDescription}
            onChange={(e) => setAiDescription(e.target.value)}
            className="mt-1 w-full rounded bg-slate-900 px-3 py-2 text-sm text-white h-20"
            placeholder="Describe what you want the agent to do..."
          />
        </section>

        {/* Steps Section */}
        <div className="border-t border-slate-700 pt-4" />

        <section className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Steps ({workflowSteps.length})
          </h3>

          {/* EXISTING STEPS */}
          <div className="space-y-3">
            {workflowSteps.map((step, idx) => {
              const action: any = step.action ?? {};
              const type = action.ai_action;
              const issue = branchIssues(step, workflowSteps.length);

              return (
                <div
                  key={step.id}
                  draggable
                  onDragStart={() => handleDragStart(step.id)}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(step.id)}
                  className={`rounded-lg border border-slate-800 bg-slate-900 p-4 transition ${
                    draggingStepId === step.id ? "opacity-40" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-300">
                        {idx + 1}
                      </span>
                      <span className="text-xs uppercase text-slate-400">
                        {type}
                      </span>
                    </div>

                    <button
                      onClick={() =>
                        selectedWorkflow &&
                        deleteStep(selectedWorkflow.id, step.id)
                      }
                      className="p-1 text-red-400 hover:text-red-300"
                    >
                      <Trash size={14} />
                    </button>
                  </div>

                  <pre className="mt-2 text-xs text-slate-200 overflow-x-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(action, null, 2)}
                  </pre>

                  {issue && (
                    <div className="mt-2 flex items-center gap-2 rounded bg-amber-900/30 px-2 py-1 text-[11px] text-amber-200">
                      <AlertTriangle size={12} />
                      {issue}
                    </div>
                  )}
                </div>
              );
            })}

            {!workflowSteps.length && (
              <p className="text-xs text-slate-500">No steps yet. Add below.</p>
            )}
          </div>

          {/* ADD STEP BUILDER */}
          {selectedWorkflow && (
            <div className="rounded-xl border border-slate-700 bg-slate-800 p-4 space-y-4">
              <h3 className="text-sm font-semibold text-white">Add New Step</h3>

              {/* Action Type */}
              <div>
                <label className="text-xs text-slate-300">Action Type</label>
                <select
                  value={form.newActionType}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      newActionType: e.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded bg-slate-900 px-3 py-2 text-sm text-white"
                >
                  <option value="">Select Action</option>
                  <option value="ask_question">Ask Question</option>
                  <option value="give_information">Give Information</option>
                  <option value="save_user_response">Save User Response</option>
                  <option value="use_knowledge_base">
                    Search Knowledge Base
                  </option>
                  <option value="branch">Branch Logic</option>
                  <option value="end">End Workflow</option>
                </select>
              </div>

              {/* Dynamic Fields */}
              {(form.newActionType === "ask_question" ||
                form.newActionType === "give_information" ||
                form.newActionType === "use_knowledge_base" ||
                form.newActionType === "end") && (
                <div>
                  <label className="text-xs text-slate-400">
                    {form.newActionType === "ask_question"
                      ? "Question to ask"
                      : form.newActionType === "give_information"
                      ? "Information text"
                      : form.newActionType === "use_knowledge_base"
                      ? "Search instruction"
                      : "Final message"}
                  </label>

                  <textarea
                    className="mt-1 w-full rounded bg-slate-900 px-3 py-2 text-sm text-white"
                    value={form.newActionText}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        newActionText: e.target.value,
                      }))
                    }
                  />
                </div>
              )}

              {/* Save user response */}
              {form.newActionType === "save_user_response" && (
                <>
                  <div>
                    <label className="text-xs text-slate-400">Variable Key</label>
                    <input
                      value={form.newSaveKey}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          newSaveKey: e.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded bg-slate-900 px-3 py-2 text-sm text-white"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400">
                      Reply text after saving
                    </label>
                    <textarea
                      value={form.newActionText}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          newActionText: e.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded bg-slate-900 px-3 py-2 text-sm text-white"
                    />
                  </div>
                </>
              )}

              {/* Branch Logic */}
              {form.newActionType === "branch" && (
                <>
                  <div>
                    <label className="text-xs text-slate-400">
                      Variable to check
                    </label>
                    <input
                      value={form.branchField}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          branchField: e.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded bg-slate-900 px-3 py-2 text-sm text-white"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400">
                      Expected value
                    </label>
                    <input
                      value={form.branchValue}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          branchValue: e.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded bg-slate-900 px-3 py-2 text-sm text-white"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400">Go to step #</label>
                    <input
                      type="number"
                      min={1}
                      value={form.branchGoto}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          branchGoto: e.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded bg-slate-900 px-3 py-2 text-sm text-white"
                    />
                  </div>
                </>
              )}

              <button
                onClick={handleSaveStep}
                disabled={!form.newActionType}
                className="w-full rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Save Step
              </button>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-400 mt-2">Error: {error}</p>
          )}
        </section>
      </main>

      {/* ──────────────────────────────────────────────
         RIGHT — LOGS
      ────────────────────────────────────────────── */}
      <aside className="rounded-xl border border-slate-700 bg-slate-900 flex flex-col">
        <div className="flex items-center gap-2 border-b border-slate-700 px-5 py-3">
          <span className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Logs
          </span>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4 text-xs">
          {selectedWorkflow ? (
            logs[selectedWorkflow.id] &&
            logs[selectedWorkflow.id].length > 0 ? (
              logs[selectedWorkflow.id].map((log) => (
                <div
                  key={log.id}
                  className="rounded-xl border border-slate-700 bg-slate-800 p-3"
                >
                  <div className="text-[11px] uppercase tracking-wide text-slate-400">
                    {log.created_at
                      ? new Date(log.created_at).toLocaleString()
                      : ""}
                  </div>

                  <div className="mt-1 text-[11px] text-slate-400">
                    Conversation:{" "}
                    <span className="text-slate-200 font-medium">
                      {log.conversation_id}
                    </span>
                  </div>

                  <pre className="mt-2 whitespace-pre-wrap break-all text-[11px] text-slate-200">
                    {JSON.stringify(
                      (log as any).data ?? (log as any).variables ?? {},
                      null,
                      2
                    )}
                  </pre>
                </div>
              ))
            ) : (
              <p className="text-slate-500">No logs to display.</p>
            )
          ) : (
            <p className="text-slate-500">Select a workflow to inspect logs.</p>
          )}
        </div>
      </aside>
    </div>
  );
}


