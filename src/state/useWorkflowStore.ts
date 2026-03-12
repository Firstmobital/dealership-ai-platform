import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";
import { useOrganizationStore } from "./useOrganizationStore";

import type { Workflow, WorkflowStep, WorkflowLog } from "../types/database";

const buildStepActionForPersist = (action: any) => {
  const a = (action ?? {}) as any;

  // Canonical contract (instruction-only builder): always persist as instruction.
  // Backend/engine expects action.ai_action + action.instruction_text; metadata must exist.
  const instruction_text =
    typeof a.instruction_text === "string" ? a.instruction_text : "";

  const metadata =
    typeof a.metadata === "object" && a.metadata !== null ? a.metadata : {};

  // Phase 8: optional media attachment per step
  // Canonical storage: action.metadata.send_media
  const send_media_raw =
    typeof a.send_media === "string"
      ? a.send_media
      : typeof (metadata as any).send_media === "string"
      ? (metadata as any).send_media
      : null;
  const send_media =
    send_media_raw && String(send_media_raw).trim()
      ? String(send_media_raw).trim()
      : null;

  const nextMetadata = {
    ...(metadata as any),
    ...(send_media ? { send_media } : {}),
  };

  // Keep legacy optional keys if they exist (for existing workflows created with old UI)
  const expected_user_input =
    typeof a.expected_user_input === "string" ? a.expected_user_input : undefined;

  return {
    // legacy/engine optional keys (preserved if present)
    ...("expects_answer" in a ? { expects_answer: a.expects_answer } : {}),
    ...("skip_if_answered" in a ? { skip_if_answered: a.skip_if_answered } : {}),
    ...("match_any_keywords" in a ? { match_any_keywords: a.match_any_keywords } : {}),

    // canonical
    ai_action: "instruction",
    instruction_text,
    ...(expected_user_input !== undefined ? { expected_user_input } : {}),
    metadata: nextMetadata,
  } as any;
};

const mergeStepActionForPersist = (existingAction: any, incomingAction: any) => {
  // Backward compatibility: preserve any legacy keys that may already exist in DB.
  // Ensure the canonical keys are always present and updated.
  const existing = (existingAction ?? {}) as any;
  const incoming = (incomingAction ?? {}) as any;
  const incomingCanonical = buildStepActionForPersist(incoming);

  // For optional canonical keys, allow explicit clearing by passing "" / {}.
  // If incoming omitted a key entirely, keep existing.
  const merged: any = {
    ...existing,
    ...incoming,
    ...incomingCanonical,
  };

  if (!("expected_user_input" in incoming)) {
    if ("expected_user_input" in existing) merged.expected_user_input = existing.expected_user_input;
  }
  if (!("metadata" in incoming)) {
    if ("metadata" in existing) merged.metadata = existing.metadata;
  }

  return merged;
};

const readCanonicalString = (
  canonicalValue: unknown,
  legacyValue: unknown,
  fallback: string
): string => {
  // action.* is authoritative; top-level mirrors are legacy fallback only.
  if (typeof canonicalValue === "string") return canonicalValue;
  if (typeof legacyValue === "string") return legacyValue;
  return fallback;
};

function normalizeWorkflowStep(row: any): WorkflowStep {
  const action = (row?.action ?? {}) as any;
  const normalizedAction: any = {
    ...action,
    ai_action: readCanonicalString(action.ai_action, row?.ai_action, "instruction"),
    instruction_text: readCanonicalString(
      action.instruction_text,
      row?.instruction_text,
      ""
    ),
    expected_user_input: readCanonicalString(
      action.expected_user_input,
      row?.expected_user_input,
      ""
    ),
    metadata:
      (typeof action.metadata === "object" && action.metadata !== null
        ? action.metadata
        : undefined) ??
      (typeof row?.metadata === "object" && row.metadata !== null ? row.metadata : undefined) ??
      {},
  };

  // Ensure send_media is always either a trimmed string or absent
  const sm = (normalizedAction.metadata as any)?.send_media;
  if (typeof sm === "string") {
    const t = sm.trim();
    if (t) (normalizedAction.metadata as any).send_media = t;
    else delete (normalizedAction.metadata as any).send_media;
  }

  return {
    ...(row as WorkflowStep),
    action: normalizedAction,
  };
}

type WorkflowState = {
  workflows: Workflow[];
  steps: Record<string, WorkflowStep[]>;
  logs: Record<string, WorkflowLog[]>;

  loading: boolean;
  saving: boolean;
  error: string | null;

  selectedWorkflow: Workflow | null;

  fetchWorkflows: () => Promise<void>;
  fetchWorkflowSteps: (workflowId: string) => Promise<void>;
  fetchWorkflowLogs: (workflowId: string) => Promise<void>;

  saveWorkflow: (payload: Partial<Workflow>) => Promise<string | null>;
  createWorkflow: (payload: Partial<Workflow>) => Promise<string | null>;
  updateWorkflow: (id: string, payload: Partial<Workflow>) => Promise<void>;
  deleteWorkflow: (workflowId: string) => Promise<void>;

  addStep: (workflowId: string, action: any) => Promise<void>;
  updateStep: (stepId: string, action: any) => Promise<void>;
  deleteStep: (workflowId: string, stepId: string) => Promise<void>;

  reorderSteps: (workflowId: string, orderedIds: string[]) => Promise<void>;
  cloneWorkflow: (workflowId: string) => Promise<string | null>;

  generateWorkflowFromDescription: (
    description: string
  ) => Promise<string | null>;

  setSelectedWorkflow: (wf: Workflow | null) => void;

  reset: () => void;
};

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflows: [],
  steps: {},
  logs: {},

  loading: false,
  saving: false,
  error: null,

  selectedWorkflow: null,
  setSelectedWorkflow: (wf) => set({ selectedWorkflow: wf }),

  reset: () =>
    set({
      workflows: [],
      steps: {},
      logs: {},
      loading: false,
      saving: false,
      error: null,
      selectedWorkflow: null,
    }),

  /* =====================================================
     FETCH WORKFLOWS (ORG ONLY)
  ===================================================== */
  fetchWorkflows: async () => {
    const { activeOrganization } = useOrganizationStore.getState();
    if (!activeOrganization?.id) {
      set({ workflows: [] });
      return;
    }

    set({ loading: true, error: null });

    const { data, error } = await supabase
      .from("workflows")
      .select("*")
      .eq("organization_id", activeOrganization.id)
      .order("created_at", { ascending: false });

    if (error) {
      set({ loading: false, error: error.message });
      return;
    }

    set({ workflows: data ?? [], loading: false });
  },

  /* =====================================================
     FETCH WORKFLOW STEPS
  ===================================================== */
  fetchWorkflowSteps: async (workflowId) => {
    const { data, error } = await supabase
      .from("workflow_steps")
      .select("*")
      .eq("workflow_id", workflowId)
      .order("step_order", { ascending: true });

    if (error) {
      set({ error: error.message });
      return;
    }

    const normalized = (data ?? []).map((s: any) => normalizeWorkflowStep(s));

    set((state) => ({
      steps: { ...state.steps, [workflowId]: normalized },
    }));
  },

  /* =====================================================
     FETCH WORKFLOW LOGS
  ===================================================== */
  fetchWorkflowLogs: async (workflowId) => {
    const { data, error } = await supabase
      .from("workflow_logs")
      .select("*")
      .eq("workflow_id", workflowId)
      .order("created_at", { ascending: false });

    if (error) {
      set({ error: error.message });
      return;
    }

    set((state) => ({
      logs: { ...state.logs, [workflowId]: data ?? [] },
    }));
  },

  /* =====================================================
     SAVE WORKFLOW
  ===================================================== */
  saveWorkflow: async (payload) => {
    if (payload.id) {
      await get().updateWorkflow(payload.id, payload);
      return payload.id;
    }
    return await get().createWorkflow(payload);
  },

  /* =====================================================
     CREATE WORKFLOW
  ===================================================== */
  createWorkflow: async (payload) => {
    const { activeOrganization } = useOrganizationStore.getState();
    if (!activeOrganization?.id) return null;

    set({ saving: true, error: null });

    const { data, error } = await supabase
      .from("workflows")
      .insert({
        organization_id: activeOrganization.id,
        name: payload.name,
        description: payload.description ?? null,
        trigger: payload.trigger ?? { type: "always" },
        mode: payload.mode ?? "smart",
        is_active: payload.is_active ?? true,
      })
      .select()
      .single();

    if (error) {
      set({ saving: false, error: error.message });
      return null;
    }

    set({
      workflows: [data, ...get().workflows],
      saving: false,
    });

    return data.id;
  },

  /* =====================================================
     UPDATE WORKFLOW
  ===================================================== */
  updateWorkflow: async (id, payload) => {
    set({ saving: true, error: null });

    const { data, error } = await supabase
      .from("workflows")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      set({ saving: false, error: error.message });
      return;
    }

    set({
      workflows: get().workflows.map((w) =>
        w.id === id ? data : w
      ),
      saving: false,
    });
  },

  /* =====================================================
     DELETE WORKFLOW
  ===================================================== */
  deleteWorkflow: async (workflowId) => {
    set({ saving: true, error: null });

    const { error } = await supabase
      .from("workflows")
      .delete()
      .eq("id", workflowId);

    if (error) {
      set({ saving: false, error: error.message });
      return;
    }

    set({
      workflows: get().workflows.filter((w) => w.id !== workflowId),
      saving: false,
    });
  },

  /* =====================================================
     ADD STEP
  ===================================================== */
  addStep: async (workflowId, action) => {

     const { activeOrganization } = useOrganizationStore.getState();
    if (!activeOrganization?.id) {
      set({ error: "No active organization selected." });
      return;
    }

    const stepOrder = (get().steps[workflowId]?.length ?? 0) + 1;
    const canonicalAction = buildStepActionForPersist(action);

    const { error } = await supabase.from("workflow_steps").insert({
      organization_id: activeOrganization.id,
      workflow_id: workflowId,
      step_order: stepOrder,
      action: canonicalAction,
      // Legacy mirrors (compat only)
      ai_action: canonicalAction.ai_action,
      instruction_text: canonicalAction.instruction_text,
      expected_user_input: canonicalAction.expected_user_input ?? null,
      metadata: (canonicalAction.metadata ?? null) as any,
    } as any);

    if (error) {
      set({ error: error.message });
      return;
    }

    await get().fetchWorkflowSteps(workflowId);
  },

  /* =====================================================
     UPDATE STEP
  ===================================================== */
  updateStep: async (stepId, action) => {
    const { data: existing, error: fetchError } = await supabase
      .from("workflow_steps")
      .select("action")
      .eq("id", stepId)
      .single();

    if (fetchError) {
      set({ error: fetchError.message });
      return;
    }

    const nextAction = mergeStepActionForPersist((existing as any)?.action, action);

    const { error } = await supabase
      .from("workflow_steps")
      .update({
        action: nextAction,
        // Legacy mirrors (compat only)
        ai_action: (nextAction as any).ai_action,
        instruction_text: (nextAction as any).instruction_text,
        expected_user_input: (nextAction as any).expected_user_input ?? null,
        metadata: ((nextAction as any).metadata ?? null) as any,
      } as any)
      .eq("id", stepId);

    if (error) set({ error: error.message });
  },

  /* =====================================================
     DELETE STEP
  ===================================================== */
  deleteStep: async (workflowId, stepId) => {
    const { error } = await supabase
      .from("workflow_steps")
      .delete()
      .eq("id", stepId);

    if (error) {
      set({ error: error.message });
      return;
    }

    await get().fetchWorkflowSteps(workflowId);
  },

  /* =====================================================
     REORDER STEPS
  ===================================================== */
  reorderSteps: async (workflowId, orderedIds) => {
    const updates = orderedIds.map((id, index) => ({
      id,
      step_order: index + 1,
    }));

    const { error } = await supabase
      .from("workflow_steps")
      .upsert(updates);

    if (error) {
      set({ error: error.message });
      return;
    }

    await get().fetchWorkflowSteps(workflowId);
  },

  /* =====================================================
     CLONE WORKFLOW
  ===================================================== */
  cloneWorkflow: async (workflowId) => {
    const state = get();

    const { data: wf } = await supabase
      .from("workflows")
      .select("*")
      .eq("id", workflowId)
      .single();

    if (!wf) return null;

    const { data: newWF, error } = await supabase
      .from("workflows")
      .insert({
        organization_id: wf.organization_id,
        name: `${wf.name} (Copy)`,
        description: wf.description,
        trigger: wf.trigger,
        mode: wf.mode,
        is_active: wf.is_active,
      })
      .select()
      .single();

    if (error || !newWF) return null;

    const { data: wfSteps } = await supabase
      .from("workflow_steps")
      .select("*")
      .eq("workflow_id", workflowId)
      .order("step_order");

    if (wfSteps?.length) {
      await supabase.from("workflow_steps").insert(
        wfSteps.map((s: any) => {
          const normalized = normalizeWorkflowStep(s);
          const canonicalAction = buildStepActionForPersist(normalized.action);

          return {
            organization_id: wf.organization_id,
            workflow_id: newWF.id,
            step_order: s.step_order,
            action: canonicalAction,
            // Legacy mirrors (compat only)
            ai_action: canonicalAction.ai_action,
            instruction_text: canonicalAction.instruction_text,
            expected_user_input: canonicalAction.expected_user_input ?? null,
            metadata: (canonicalAction.metadata ?? null) as any,
          } as any;
        })
      );
    }

    await state.fetchWorkflows();
    await state.fetchWorkflowSteps(newWF.id);

    return newWF.id;
  },

  /* =====================================================
     GENERATE WORKFLOW FROM DESCRIPTION (AI)
  ===================================================== */
  generateWorkflowFromDescription: async (description) => {
    const { activeOrganization } = useOrganizationStore.getState();
    if (!activeOrganization?.id) return null;

    set({ saving: true, error: null });

    const { data, error } = await supabase.functions.invoke(
      "workflow-generator",
      {
        body: {
          organization_id: activeOrganization.id,
          description,
        },
      }
    );

    if (error || !data?.workflow) {
      set({
        saving: false,
        error: error?.message ?? "Failed to generate workflow.",
      });
      return null;
    }

    const wf = data.workflow;

    const { data: newWF, error: insertErr } = await supabase
      .from("workflows")
      .insert({
        organization_id: activeOrganization.id,
        name: wf.name,
        description: wf.description ?? description,
        trigger: wf.trigger ?? { type: "always" },
        mode: wf.mode ?? "smart",
        is_active: wf.is_active ?? true,
      })
      .select()
      .single();

    if (insertErr || !newWF) {
      set({
        saving: false,
        error: insertErr?.message ?? "Could not save workflow.",
      });
      return null;
    }

    const workflowId = newWF.id as string;

    if (Array.isArray(wf.steps)) {
      await supabase.from("workflow_steps").insert(
        wf.steps.map((s: any, i: number) => {
          const canonicalAction = buildStepActionForPersist({
            ...s,
            ai_action: s.ai_action,
            instruction_text: s.instruction_text ?? "",
            expected_user_input: s.expected_user_input ?? "",
            metadata: s.metadata ?? {},
          });

          return {
            organization_id: activeOrganization.id,
            workflow_id: workflowId,
            step_order: i + 1,
            action: canonicalAction,
            // Legacy mirrors (compat only)
            ai_action: canonicalAction.ai_action,
            instruction_text: canonicalAction.instruction_text,
            expected_user_input: canonicalAction.expected_user_input ?? null,
            metadata: (canonicalAction.metadata ?? null) as any,
          } as any;
        })
      );
    }

    await get().fetchWorkflowSteps(workflowId);
    await get().fetchWorkflows();

    set({ saving: false });

    return workflowId;
  },
}));
