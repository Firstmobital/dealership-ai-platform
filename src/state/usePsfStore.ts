// /src/state/usePsfStore.ts

import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";
import { useOrganizationStore } from "./useOrganizationStore";

/* ============================================================================
   TYPES
============================================================================ */

export type PsfSentiment = "positive" | "negative" | "neutral" | null;
export type PsfResolutionStatus = "open" | "resolved";

export type PsfCase = {
  id: string;

  organization_id: string;

  campaign_id: string;
  campaign_name: string | null;

  conversation_id: string | null;

  phone: string;

  uploaded_data: Record<string, any>;

  sentiment: PsfSentiment;
  ai_summary: string | null;

  action_required: boolean;
  resolution_status: PsfResolutionStatus;

  initial_sent_at: string | null;
  reminder_sent_at: string | null;
  last_reminder_sent_at: string | null;
  reminders_sent_count: number | null;

  last_customer_reply_at: string | null;

  created_at: string;
  updated_at: string;
};

/* ============================================================================
   STORE STATE
============================================================================ */

type PsfState = {
  cases: PsfCase[];
  loading: boolean;
  error: string | null;

  selectedCase: PsfCase | null;

  fetchCases: (opts?: {
    sentiment?: PsfSentiment;
    resolution_status?: PsfResolutionStatus;
    campaign_id?: string;
  }) => Promise<void>;

  selectCase: (psfCase: PsfCase | null) => void;

  markResolved: (psfCaseId: string) => Promise<void>;

  sendReminder: (psfCaseId: string) => Promise<void>;
};

/* ============================================================================
   STORE
============================================================================ */

export const usePsfStore = create<PsfState>((set, get) => ({
  cases: [],
  loading: false,
  error: null,

  selectedCase: null,

  /* ------------------------------------------------------------------------
     FETCH PSF CASES (ORG ONLY)
  ------------------------------------------------------------------------ */
  fetchCases: async (opts = {}) => {
    const { activeOrganization } = useOrganizationStore.getState();

    if (!activeOrganization?.id) {
      set({ cases: [], loading: false });
      return;
    }

    set({ loading: true, error: null });

    try {
      let query = supabase
        .from("psf_cases_view")
        .select("*")
        .eq("organization_id", activeOrganization.id)
        .order("created_at", { ascending: false });

      if (opts.sentiment !== undefined) {
        if (opts.sentiment === null) {
          query = query.is("sentiment", null);
        } else {
          query = query.eq("sentiment", opts.sentiment);
        }
      }

      if (opts.resolution_status) {
        query = query.eq("resolution_status", opts.resolution_status);
      }

      if (opts.campaign_id) {
        query = query.eq("campaign_id", opts.campaign_id);
      }

      const { data, error } = await query;
      if (error) throw error;

      set({ cases: (data ?? []) as PsfCase[] });
    } catch (err: any) {
      console.error("[PSF] fetchCases error", err);
      set({ error: err?.message ?? "Failed to load PSF cases" });
    } finally {
      set({ loading: false });
    }
  },

  /* ------------------------------------------------------------------------
     SELECT CASE
  ------------------------------------------------------------------------ */
  selectCase: (psfCase) => {
    set({ selectedCase: psfCase });
  },

  /* ------------------------------------------------------------------------
     MARK CASE AS RESOLVED
  ------------------------------------------------------------------------ */
  markResolved: async (psfCaseId: string) => {
    try {
      const { error } = await supabase
        .from("psf_cases")
        .update({
          resolution_status: "resolved",
          action_required: false,
        })
        .eq("id", psfCaseId);
  
      if (error) throw error;
  
      const updatedCases: PsfCase[] = get().cases.map((c) =>
        c.id === psfCaseId
          ? {
              ...c,
              resolution_status: "resolved" as const,
              action_required: false,
            }
          : c
      );
  
      set({
        cases: updatedCases,
        selectedCase:
          get().selectedCase?.id === psfCaseId
            ? {
                ...get().selectedCase!,
                resolution_status: "resolved" as const,
                action_required: false,
              }
            : get().selectedCase,
      });
    } catch (err) {
      console.error("[PSF] markResolved error", err);
      throw err;
    }
  },  

  /* ------------------------------------------------------------------------
     SEND MANUAL REMINDER (EDGE FUNCTION)
  ------------------------------------------------------------------------ */
  sendReminder: async (psfCaseId: string) => {
    try {
      const { data: session } = await supabase.auth.getSession();

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/psf-send-manual-reminder`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.session?.access_token}`,
          },
          body: JSON.stringify({ psf_case_id: psfCaseId }),
        }
      );

      if (!res.ok) {
        const t = await res.text();
        throw new Error(t);
      }

      // Refresh list to reflect reminder count + timestamps
      await get().fetchCases();
    } catch (err) {
      console.error("[PSF] sendReminder error", err);
      throw err;
    }
  },
}));
