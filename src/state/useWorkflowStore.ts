import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";
import { useOrganizationStore } from "./useOrganizationStore";

import type { Workflow, WorkflowStep, WorkflowLog } from "../types/database";

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

    set((state) => ({
      steps: { ...state.steps, [workflowId]: data ?? [] },
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
    const stepOrder = (get().steps[workflowId]?.length ?? 0) + 1;

    const { error } = await supabase.from("workflow_steps").insert({
      workflow_id: workflowId,
      step_order: stepOrder,
      action,
    });

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
    const { error } = await supabase
      .from("workflow_steps")
      .update({ action })
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
        wfSteps.map((s: any) => ({
          workflow_id: newWF.id,
          step_order: s.step_order,
          action: s.action,
        }))
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
        wf.steps.map((s: any, i: number) => ({
          workflow_id: workflowId,
          step_order: i + 1,
          action: {
            ai_action: s.ai_action,
            instruction_text: s.instruction_text ?? "",
            expected_user_input: s.expected_user_input ?? "",
            metadata: s.metadata ?? {},
          },
        }))
      );
    }

    await get().fetchWorkflowSteps(workflowId);
    await get().fetchWorkflows();

    set({ saving: false });

    return workflowId;
  },
}));
