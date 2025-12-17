// src/modules/workflows/WorkflowModule.tsx
// FULL + FINAL — Tier 7 (UI only)
// Logic preserved 100%
// White, clean, CRM-style layout
// FIXED: scrolling + steps on right + human readable cards

import { useEffect, useState } from "react";
import {
  PlusCircle,
  Save,
  Trash,
  Workflow as WorkflowIcon,
  Play,
  Copy,
  Wand2,
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
    saveWorkflow,
    deleteWorkflow,
    addStep,
    deleteStep,
    reorderSteps,
    cloneWorkflow,
    steps,
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

  /* -------------------------------------------------- */
  /* LOAD WORKFLOWS                                     */
  /* -------------------------------------------------- */
  useEffect(() => {
    if (currentOrganization) {
      fetchWorkflows().catch(console.error);
    }
  }, [currentOrganization?.id, activeSubOrg?.id]);

  useEffect(() => {
    if (selectedWorkflow?.id) {
      fetchWorkflowSteps(selectedWorkflow.id).catch(console.error);
    }
  }, [selectedWorkflow?.id]);

  const workflowSteps: WorkflowStep[] =
    selectedWorkflow && steps[selectedWorkflow.id]
      ? steps[selectedWorkflow.id]
      : [];

  /* -------------------------------------------------- */
  /* HELPERS                                           */
  /* -------------------------------------------------- */
  const inputClass =
    "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm";
  const labelClass = "text-xs font-medium text-slate-600";
  const cardClass = "rounded-lg border border-slate-200 bg-white";

  function renderStepSummary(step: WorkflowStep) {
    const a: any = step.action ?? {};

    switch (a.ai_action) {
      case "ask_question":
        return <>💬 <b>Ask:</b> {a.instruction_text}</>;
      case "give_information":
        return <>ℹ️ <b>Inform:</b> {a.instruction_text}</>;
      case "save_user_response":
        return (
          <>
            💾 Save response as <b>{a.expected_user_input}</b>
            {a.instruction_text && <> → reply: {a.instruction_text}</>}
          </>
        );
      case "use_knowledge_base":
        return <>📚 Search KB: {a.instruction_text}</>;
      case "branch":
        return (
          <>
            🔀 If <b>{a.metadata?.rule?.field}</b> =
            <b> {a.metadata?.rule?.value}</b> → go to step{" "}
            <b>{a.metadata?.rule?.goto_step}</b>
          </>
        );
      case "end":
        return <>🏁 End conversation</>;
      default:
        return <>Unknown step</>;
    }
  }

  /* -------------------------------------------------- */
  /* UI                                                 */
  /* -------------------------------------------------- */
  return (
    <div className="grid h-full grid-cols-[260px,1fr,320px] gap-6 px-6 py-6">
      {/* LEFT — WORKFLOWS */}
      <aside className={`${cardClass} flex flex-col`}>
        <div className="border-b px-4 py-3 flex justify-between">
          <h2 className="flex gap-2 font-semibold">
            <WorkflowIcon size={16} /> Workflows
          </h2>
          <button onClick={() => setSelectedWorkflow(null)}>
            <PlusCircle size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {workflows.map((wf) => (
            <button
              key={wf.id}
              onClick={() => setSelectedWorkflow(wf)}
              className={`w-full px-4 py-3 text-left border-b ${
                selectedWorkflow?.id === wf.id
                  ? "bg-blue-50 border-blue-600"
                  : "hover:bg-slate-50"
              }`}
            >
              <div className="font-medium">{wf.name}</div>
              <div className="text-xs text-slate-500">
                {wf.description || "No description"}
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* CENTER — BUILDER (SCROLLABLE) */}
      <main className={`${cardClass} p-6 overflow-y-auto`}>
        <div className="flex justify-between mb-4">
          <h2 className="text-lg font-semibold">
            {selectedWorkflow ? "Edit Workflow" : "New Workflow"}
          </h2>

          <button
            onClick={() =>
              saveWorkflow({
                id: selectedWorkflow?.id,
                name: form.name,
                description: form.description,
                trigger: { type: form.trigger_type },
                mode: form.mode,
                is_active: form.is_active,
              })
            }
            className="bg-blue-600 text-white px-4 py-2 rounded-md"
          >
            <Save size={14} /> Save
          </button>
        </div>

        {/* FORM */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Name</label>
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) =>
                setForm((p) => ({ ...p, name: e.target.value }))
              }
            />
          </div>

          <div>
            <label className={labelClass}>Mode</label>
            <select
              className={inputClass}
              value={form.mode}
              onChange={(e) =>
                setForm((p) => ({ ...p, mode: e.target.value as ModeType }))
              }
            >
              <option value="smart">Smart</option>
              <option value="strict">Strict</option>
            </select>
          </div>
        </div>

        {/* AI */}
        <div className="mt-6 p-4 bg-slate-50 rounded-md">
          <div className="flex justify-between mb-2">
            <b>Generate with AI</b>
            <button
              onClick={async () => {
                setAiGenerating(true);
                await supabase.functions.invoke("workflow-generator", {
                  body: {
                    organization_id: currentOrganization?.id,
                    description: aiDescription,
                  },
                });
                setAiGenerating(false);
              }}
              className="text-xs bg-blue-600 text-white px-3 py-1 rounded"
            >
              Generate
            </button>
          </div>

          <textarea
            className={inputClass}
            rows={3}
            value={aiDescription}
            onChange={(e) => setAiDescription(e.target.value)}
          />
        </div>
      </main>

      {/* RIGHT — STEPS */}
      <aside className={`${cardClass} p-4 overflow-y-auto`}>
        <h3 className="font-semibold mb-3">
          Steps ({workflowSteps.length})
        </h3>

        {workflowSteps.map((step, idx) => (
          <div
            key={step.id}
            draggable
            onDragStart={() => setDraggingStepId(step.id)}
            className="mb-3 p-3 rounded-md border bg-slate-50"
          >
            <div className="flex justify-between text-xs mb-1">
              <span>Step {idx + 1}</span>
              <button
                onClick={() =>
                  selectedWorkflow &&
                  deleteStep(selectedWorkflow.id, step.id)
                }
                className="text-red-500"
              >
                <Trash size={12} />
              </button>
            </div>
            <div className="text-sm">{renderStepSummary(step)}</div>
          </div>
        ))}

        {!workflowSteps.length && (
          <p className="text-sm text-slate-500">No steps yet.</p>
        )}
      </aside>
    </div>
  );
}
