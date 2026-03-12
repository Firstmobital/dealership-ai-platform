import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";
import { useOrganizationStore } from "./useOrganizationStore";

type AnalyticsState = {
  loading: boolean;

  overview: any[];
  campaigns: any[];
  templates: any[];
  workflowUsage: WorkflowUsageRow[];

  fetchOverview: (from: string, to: string) => Promise<void>;
  fetchCampaigns: () => Promise<void>;
  fetchTemplates: () => Promise<void>;
  fetchWorkflowUsage: () => Promise<void>;

  reset: () => void;
};

type WorkflowUsageRow = {
  workflow_id: string;
  workflow_name: string;
  started_count: number;
  completed_count: number;
  escalated_count: number;
  active_count: number;
  avg_current_step: number;
  current_step_distribution: Record<string, number>;
};

type WorkflowLogAnalyticsRow = {
  workflow_id: string | null;
  current_step_number: number | null;
  completed: boolean | null;
};

type WorkflowStepAnalyticsRow = {
  workflow_id: string | null;
  step_order: number;
  ai_action: string | null;
  action: Record<string, unknown> | null;
};

function aggregateWorkflowUsage(params: {
  workflows: Array<{ id: string; name: string | null }>;
  logs: WorkflowLogAnalyticsRow[];
  steps: WorkflowStepAnalyticsRow[];
}): WorkflowUsageRow[] {
  const stepActionByWorkflowAndOrder = new Map<string, string>();

  for (const step of params.steps) {
    if (!step.workflow_id || !Number.isFinite(step.step_order)) continue;
    const nestedAction =
      step.action && typeof step.action["ai_action"] === "string"
        ? String(step.action["ai_action"])
        : null;
    const normalizedAction = (step.ai_action ?? nestedAction ?? "").toLowerCase();
    stepActionByWorkflowAndOrder.set(
      `${step.workflow_id}:${step.step_order}`,
      normalizedAction
    );
  }

  const grouped = new Map<string, WorkflowUsageRow>();
  for (const workflow of params.workflows) {
    grouped.set(workflow.id, {
      workflow_id: workflow.id,
      workflow_name: workflow.name ?? "Untitled workflow",
      started_count: 0,
      completed_count: 0,
      escalated_count: 0,
      active_count: 0,
      avg_current_step: 0,
      current_step_distribution: {},
    });
  }

  const stepSums = new Map<string, number>();
  for (const log of params.logs) {
    if (!log.workflow_id) continue;

    const row =
      grouped.get(log.workflow_id) ??
      ({
        workflow_id: log.workflow_id,
        workflow_name: "Untitled workflow",
        started_count: 0,
        completed_count: 0,
        escalated_count: 0,
        active_count: 0,
        avg_current_step: 0,
        current_step_distribution: {},
      } satisfies WorkflowUsageRow);

    row.started_count += 1;

    const step = Number.isFinite(log.current_step_number ?? NaN)
      ? Number(log.current_step_number)
      : 1;
    stepSums.set(log.workflow_id, (stepSums.get(log.workflow_id) ?? 0) + step);

    const bucket = String(step);
    row.current_step_distribution[bucket] =
      (row.current_step_distribution[bucket] ?? 0) + 1;

    if (log.completed === true) {
      row.completed_count += 1;

      const completionStep = Math.max(1, step - 1);
      const completionAction = stepActionByWorkflowAndOrder.get(
        `${log.workflow_id}:${completionStep}`
      );
      if (completionAction === "escalate") {
        row.escalated_count += 1;
      }
    } else {
      row.active_count += 1;
    }

    grouped.set(log.workflow_id, row);
  }

  return Array.from(grouped.values())
    .map((row) => ({
      ...row,
      avg_current_step:
        row.started_count > 0
          ? Number(((stepSums.get(row.workflow_id) ?? 0) / row.started_count).toFixed(2))
          : 0,
    }))
    .sort((a, b) => b.started_count - a.started_count);
}

export const useAnalyticsStore = create<AnalyticsState>((set) => ({
  loading: false,

  overview: [],
  campaigns: [],
  templates: [],
  workflowUsage: [],

  reset: () =>
    set({
      loading: false,
      overview: [],
      campaigns: [],
      templates: [],
      workflowUsage: [],
    }),

  /* ======================================================
     OVERVIEW (Daily WhatsApp Stats — ORG ONLY)
  ====================================================== */
  fetchOverview: async (from, to) => {
    const { activeOrganization } = useOrganizationStore.getState();

    if (!activeOrganization?.id) return;

    set({ loading: true });

    const { data, error } = await supabase
      .from("whatsapp_overview_daily_v1")
      .select("*")
      .eq("organization_id", activeOrganization.id)
      .gte("day", from)
      .lte("day", to)
      .order("day", { ascending: true });

    if (error) {
      console.error("[Analytics] fetchOverview error", error);
    } else {
      set({ overview: data ?? [] });
    }

    set({ loading: false });
  },

  /* ======================================================
     CAMPAIGN ANALYTICS (ORG ONLY)
  ====================================================== */
  fetchCampaigns: async () => {
    const { activeOrganization } = useOrganizationStore.getState();

    if (!activeOrganization?.id) return;

    set({ loading: true });

    const { data, error } = await supabase
      .from("campaign_analytics_summary_v2")
      .select("*")
      .eq("organization_id", activeOrganization.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Analytics] fetchCampaigns error", error);
    } else {
      set({ campaigns: data ?? [] });
    }

    set({ loading: false });
  },

  /* ======================================================
     TEMPLATE ANALYTICS (ORG ONLY)
  ====================================================== */
  fetchTemplates: async () => {
    const { activeOrganization } = useOrganizationStore.getState();

    if (!activeOrganization?.id) return;

    set({ loading: true });

    const { data, error } = await supabase
      .from("template_analytics_summary_v2")
      .select("*")
      .eq("organization_id", activeOrganization.id)
      .order("total_messages", { ascending: false });

    if (error) {
      console.error("[Analytics] fetchTemplates error", error);
    } else {
      set({ templates: data ?? [] });
    }

    set({ loading: false });
  },

  /* ======================================================
     WORKFLOW USAGE ANALYTICS (ORG ONLY)
  ====================================================== */
  fetchWorkflowUsage: async () => {
    const { activeOrganization } = useOrganizationStore.getState();

    if (!activeOrganization?.id) return;

    set({ loading: true });

    const [workflowsRes, logsRes, stepsRes] = await Promise.all([
      supabase
        .from("workflows")
        .select("id,name")
        .eq("organization_id", activeOrganization.id),
      supabase
        .from("workflow_logs")
        .select("workflow_id,current_step_number,completed")
        .eq("organization_id", activeOrganization.id),
      supabase
        .from("workflow_steps")
        .select("workflow_id,step_order,ai_action,action")
        .eq("organization_id", activeOrganization.id),
    ]);

    if (workflowsRes.error || logsRes.error || stepsRes.error) {
      console.error("[Analytics] fetchWorkflowUsage error", {
        workflows: workflowsRes.error,
        logs: logsRes.error,
        steps: stepsRes.error,
      });
      set({ loading: false });
      return;
    }

    const usage = aggregateWorkflowUsage({
      workflows: (workflowsRes.data ?? []) as Array<{ id: string; name: string | null }>,
      logs: (logsRes.data ?? []) as unknown as WorkflowLogAnalyticsRow[],
      steps: (stepsRes.data ?? []) as unknown as WorkflowStepAnalyticsRow[],
    });

    set({ workflowUsage: usage, loading: false });
  },
}));