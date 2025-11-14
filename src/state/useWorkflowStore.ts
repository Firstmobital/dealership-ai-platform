import { create } from 'zustand';
import { supabase } from '../lib/supabaseClient';
import type { Workflow, WorkflowLog, WorkflowStep } from '../types/database';

type WorkflowState = {
  workflows: Workflow[];
  steps: Record<string, WorkflowStep[]>;
  logs: Record<string, WorkflowLog[]>;
  loading: boolean;
  fetchWorkflows: (organizationId: string) => Promise<void>;
  fetchWorkflowSteps: (workflowId: string) => Promise<void>;
  fetchWorkflowLogs: (workflowId: string) => Promise<void>;
  saveWorkflow: (payload: Partial<Workflow>) => Promise<string>;
  saveStep: (workflowId: string, step: Partial<WorkflowStep>) => Promise<void>;
};

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflows: [],
  steps: {},
  logs: {},
  loading: false,
  fetchWorkflows: async (organizationId) => {
    set({ loading: true });
    const { data, error } = await supabase
      .from('workflows')
      .select('*')
      .eq('organization_id', organizationId)
      .order('name', { ascending: true });
    if (error) throw error;
    set({ workflows: data ?? [], loading: false });
  },
  fetchWorkflowSteps: async (workflowId) => {
    const { data, error } = await supabase
      .from('workflow_steps')
      .select('*')
      .eq('workflow_id', workflowId)
      .order('step_order', { ascending: true });
    if (error) throw error;
    set((state) => ({ steps: { ...state.steps, [workflowId]: data ?? [] } }));
  },
  fetchWorkflowLogs: async (workflowId) => {
    const { data, error } = await supabase
      .from('workflow_logs')
      .select('*')
      .eq('workflow_id', workflowId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    set((state) => ({ logs: { ...state.logs, [workflowId]: data ?? [] } }));
  },
  saveWorkflow: async (payload) => {
    const { id, ...rest } = payload;
    if (id) {
      const { error } = await supabase.from('workflows').update(rest).eq('id', id);
      if (error) throw error;
      return id;
    }
    const { data, error } = await supabase.from('workflows').insert(rest).select('id').single();
    if (error) throw error;
    await get().fetchWorkflows(rest.organization_id as string);
    return data!.id;
  },
  saveStep: async (workflowId, step) => {
    const { id, ...rest } = step;
    if (id) {
      const { error } = await supabase.from('workflow_steps').update(rest).eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('workflow_steps').insert({ ...rest, workflow_id: workflowId });
      if (error) throw error;
    }
    await get().fetchWorkflowSteps(workflowId);
  }
}));
