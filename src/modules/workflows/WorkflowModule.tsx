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
import { createPortal } from "react-dom";
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
import { useWhatsappTemplateStore } from "../../state/useWhatsappTemplateStore";

import type { Workflow, WorkflowStep } from "../../types/database";

/* ------------------------------------------------------------------ */
/* TYPES                                                              */
/* ------------------------------------------------------------------ */

type TriggerType = "keyword" | "intent" | "always" | "whatsapp_template";
type ModeType = "smart" | "strict";

type WorkflowFormState = {
  name: string;
  description: string;
  mode: ModeType;
  trigger_type: TriggerType;
  keywords: string;
  intents: string;
  templates: string[];
  is_active: boolean;
};

type StepDraft = {
  instruction_text: string;
};

const DEFAULT_STEP_DRAFT: StepDraft = {
  instruction_text: "",
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
      <div className="font-medium">Instruction</div>
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
    templates: whatsappTemplates,
    fetchTemplates: fetchWhatsappTemplates,
  } = useWhatsappTemplateStore();

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
    templates: [],
    is_active: true,
  });

  const [aiDescription, setAiDescription] = useState("");
  const [templateQuery, setTemplateQuery] = useState("");
  const [templatePopoverOpen, setTemplatePopoverOpen] = useState(false);
  const [templateDraft, setTemplateDraft] = useState<string[]>([]);
  const [templatePopoverPos, setTemplatePopoverPos] = useState<
    { top: number; left: number; width: number } | null
  >(null);
  const [templatePopoverSide, setTemplatePopoverSide] = useState<"bottom" | "top">(
    "bottom"
  );
  const [templateTriggerEl, setTemplateTriggerEl] = useState<HTMLButtonElement | null>(
    null
  );

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
    fetchWhatsappTemplates().catch(console.error);
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
      templates: [],
      is_active: true,
    });
    setAiDescription("");
    setTemplateQuery("");
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

    if (form.trigger_type === "whatsapp_template") {
      // IMPORTANT: persist template *names* (not ids)
      base.templates = Array.isArray(form.templates)
        ? form.templates
            .map((t) => String(t || "").trim())
            .filter(Boolean)
        : [];
    }

    return base;
  };

  // Prevent stale template selection from carrying over when switching trigger types.
  useEffect(() => {
    if (form.trigger_type === "whatsapp_template") return;
    if (form.templates.length === 0) return;
    setForm((prev) => ({ ...prev, templates: [] }));
    setTemplateDraft([]);
    setTemplateQuery("");
    setTemplatePopoverOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.trigger_type]);

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
      templates: Array.isArray(trig.templates)
        ? trig.templates.map((t: any) => String(t || "")).filter(Boolean)
        : [],
      is_active: typeof (wf as any)?.is_active === "boolean" ? (wf as any).is_active : true,
    });

    setNewStep(null);
    setEditingStepId(null);
    setStepDraft(null);
    setTemplateQuery("");
    setTemplatePopoverOpen(false);
    setTemplateDraft(
      Array.isArray(trig.templates)
        ? trig.templates.map((t: any) => String(t || "")).filter(Boolean)
        : []
    );
  };

  const templateOptions = useMemo(() => {
    const rows = (whatsappTemplates || []) as any[];
    return rows
      .map((t) => ({
        name: String(t?.name || "").trim(),
        language: String(t?.language || "").trim(),
      }))
      .filter((t) => Boolean(t.name));
  }, [whatsappTemplates]);

  const filteredTemplateOptions = useMemo(() => {
    const q = templateQuery.trim().toLowerCase();
    if (!q) return templateOptions;
    return templateOptions.filter((t) => {
      return (
        t.name.toLowerCase().includes(q) ||
        t.language.toLowerCase().includes(q)
      );
    });
  }, [templateOptions, templateQuery]);

  const templateDisplayText = useMemo(() => {
    const names = (form.templates || []).filter(Boolean);
    if (!names.length) return "Select templates…";

    // Show comma-separated text with a bounded length and "+N more".
    // Deterministic, no measuring.
    const maxChars = 46;
    let built = "";
    let used = 0;

    for (let i = 0; i < names.length; i++) {
      const seg = (i === 0 ? "" : ", ") + names[i];
      if (built.length + seg.length > maxChars) {
        used = i;
        break;
      }
      built += seg;
      used = i + 1;
    }

    const remaining = names.length - used;
    if (remaining > 0) {
      return (built ? built : names[0]) + ` +${remaining} more`;
    }

    return built;
  }, [form.templates]);

  // Close on outside click / Esc for the template popover
  useEffect(() => {
    if (!templatePopoverOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTemplatePopoverOpen(false);
    };

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      // If click is inside trigger button, ignore
      if (templateTriggerEl && templateTriggerEl.contains(target)) return;
      // If click is inside popover content, ignore
      const pop = document.getElementById("wf-template-popover");
      if (pop && pop.contains(target)) return;
      setTemplatePopoverOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, [templatePopoverOpen, templateTriggerEl]);

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
      {/* LAYOUT: grid columns = [left list, center form, right steps]
          - Keep left at 300px
          - Increase right (steps) width by ~20% (380px → 456px)
      */}
      <div className="grid h-full grid-cols-[300px,1fr,456px] gap-8 px-8 py-6 overflow-hidden">
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
                  <option value="whatsapp_template">When WhatsApp template was sent</option>
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

              {form.trigger_type === "whatsapp_template" && (
                <div className="space-y-2">
                  <label className={labelClass}>WhatsApp templates</label>

                  <button
                    ref={(el) => setTemplateTriggerEl(el)}
                    type="button"
                    className={`${inputClass} mt-0 flex items-center justify-between gap-2`}
                    aria-haspopup="listbox"
                    aria-expanded={templatePopoverOpen}
                    onClick={(e) => {
                      const el = e.currentTarget as HTMLButtonElement;
                      const rect = el.getBoundingClientRect();

                      // Preferred: open down. Flip up if not enough space below.
                      const sideOffset = 8;
                      const collisionPadding = 8;
                      const expectedPopoverHeight = 420; // matches max-h-[420px]
                      const spaceBelow =
                        window.innerHeight - rect.bottom - collisionPadding;
                      const spaceAbove = rect.top - collisionPadding;
                      const nextSide: "bottom" | "top" =
                        spaceBelow < expectedPopoverHeight && spaceAbove > spaceBelow
                          ? "top"
                          : "bottom";

                      setTemplatePopoverSide(nextSide);

                      const top =
                        nextSide === "bottom"
                          ? rect.bottom + window.scrollY + sideOffset
                          : rect.top + window.scrollY - sideOffset;

                      setTemplatePopoverPos({
                        top,
                        left: rect.left + window.scrollX,
                        width: rect.width,
                      });

                      const nextOpen = !templatePopoverOpen;
                      setTemplatePopoverOpen(nextOpen);
                      if (nextOpen) {
                        setTemplateDraft([...(form.templates || [])]);
                        setTemplateQuery("");
                      }
                    }}
                  >
                    <span className="min-w-0 truncate text-left">
                      {templateDisplayText}
                    </span>
                    <span className="text-slate-400">▾</span>
                  </button>

                  {templatePopoverOpen &&
                    templatePopoverPos &&
                    createPortal(
                      <div
                        id="wf-template-popover"
                        className="fixed z-50 rounded-md border border-slate-200 bg-white shadow-lg"
                        style={{
                          ...(templatePopoverSide === "bottom"
                            ? { top: templatePopoverPos.top }
                            : { bottom: window.innerHeight - templatePopoverPos.top }),
                          left: templatePopoverPos.left,
                          width: Math.max(320, templatePopoverPos.width),
                        }}
                      >
                        <div
                          className={
                            "flex max-h-[420px] flex-col " +
                            (templatePopoverSide === "top" ? "origin-bottom" : "origin-top")
                          }
                        >
                          <div className="p-3">
                            <input
                              className={inputClass}
                              value={templateQuery}
                              onChange={(e) => setTemplateQuery(e.target.value)}
                              placeholder="Search templates…"
                              autoFocus
                            />
                          </div>

                          <div
                            className="max-h-[280px] overflow-y-auto border-t border-slate-100"
                            role="listbox"
                            aria-label="WhatsApp templates"
                          >
                            {filteredTemplateOptions.length === 0 ? (
                              <div className="px-3 py-3 text-sm text-slate-500">
                                No templates found.
                              </div>
                            ) : (
                              filteredTemplateOptions.slice(0, 120).map((t) => {
                                const name = t.name;
                                const lang = t.language;
                                const key = `${name}::${lang || "-"}`;
                                const checked = templateDraft.includes(name);

                                return (
                                  <label
                                    key={key}
                                    className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-slate-50"
                                  >
                                    <span className="min-w-0">
                                      <span className="block font-medium text-slate-900 truncate">
                                        {name}
                                      </span>
                                      <span className="block text-xs text-slate-500">
                                        {lang || "—"}
                                      </span>
                                    </span>

                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(ev) => {
                                        const next = new Set(templateDraft);
                                        if (ev.target.checked) next.add(name);
                                        else next.delete(name);
                                        setTemplateDraft([...next]);
                                      }}
                                    />
                                  </label>
                                );
                              })
                            )}
                          </div>

                          <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-slate-100 bg-white p-3">
                            <div className="text-xs text-slate-500">
                              Selected: {templateDraft.length}
                            </div>
                            <button
                              type="button"
                              className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
                              onClick={() => {
                                const committed = Array.from(
                                  new Set(
                                    (templateDraft || [])
                                      .map((x) => String(x || "").trim())
                                      .filter(Boolean)
                                  )
                                );
                                setForm({ ...form, templates: committed });
                                setTemplatePopoverOpen(false);
                              }}
                            >
                              Done
                            </button>
                          </div>
                        </div>
                      </div>,
                      document.body
                    )}
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
                onClick={() => setNewStep({ ...DEFAULT_STEP_DRAFT })}
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
                          const a: any = (step as any)?.action ?? {};
                          setStepDraft({
                            instruction_text: safeString(a.instruction_text),
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
                        placeholder="Write a simple instruction for this step…"
                      />

                      <div className="flex items-center gap-2">
                        <button
                          onClick={async () => {
                            if (!stepDraft) return;

                            await updateStep(step.id, {
                              instruction_text: stepDraft.instruction_text,
                            });
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
                placeholder="Write a simple instruction for this step…"
                value={newStep.instruction_text}
                onChange={(e) =>
                  setNewStep((prev) =>
                    prev
                      ? {
                          ...prev,
                          instruction_text: e.target.value,
                        }
                      : prev
                  )
                }
              />

              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    if (!workflowId) return;
                    if (!newStep) return;

                    await addStep(workflowId, {
                      instruction_text: newStep.instruction_text,
                    });
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