import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";
import { useOrganizationStore } from "./useOrganizationStore";
import type { PsfCase, PsfSentiment, PsfResolutionStatus } from "../types/database";


/* ============================================================================
   STORE STATE
============================================================================ */

type FetchOptions = {
  resolution_status?: PsfResolutionStatus;
  campaign_id?: string;
};

type PsfState = {
  cases: PsfCase[];
  loading: boolean;
  error: string | null;

  selectedCase: PsfCase | null;

  fetchCases: (opts?: FetchOptions) => Promise<void>;
  selectCase: (psfCase: PsfCase | null) => void;

  markResolved: (psfCaseId: string) => Promise<void>;
  sendReminder: (psfCaseId: string) => Promise<void>;

  reset: () => void;
};

/* ============================================================================
   STORE
============================================================================ */

export const usePsfStore = create<PsfState>((set, get) => ({
  cases: [],
  loading: false,
  error: null,

  selectedCase: null,

  reset: () =>
    set({
      cases: [],
      loading: false,
      error: null,
      selectedCase: null,
    }),

  /* ------------------------------------------------------------------------
     FETCH PSF CASES (ORG-SCOPED, VIEW-BASED)
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
      .select(`
        id,
        organization_id,
        campaign_id,
        phone,
        customer_name,
        model,
        resolution_status,
        action_required,
        initial_sent_at,
        last_customer_reply_at,
        resolved_at,
        reminders_sent_count,
        conversation_id,
        campaign_name
      `)      
        .eq("organization_id", activeOrganization.id)
        .order("created_at", { ascending: false });

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
      set({
        error: err?.message ?? "Failed to load PSF cases",
        cases: [],
      });
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
          resolved_at: new Date().toISOString(),
        })
        .eq("id", psfCaseId);

      if (error) throw error;

      set((state) => ({
        cases: state.cases.map((c) =>
          c.id === psfCaseId
            ? {
                ...c,
                resolution_status: "resolved",
                action_required: false,
              }
            : c
        ),
        selectedCase:
          state.selectedCase?.id === psfCaseId
            ? {
                ...state.selectedCase,
                resolution_status: "resolved",
                action_required: false,
              }
            : state.selectedCase,
      }));
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
        const text = await res.text();
        throw new Error(text);
      }

      // Refresh list to reflect reminder_count + timestamps
      await get().fetchCases();
    } catch (err) {
      console.error("[PSF] sendReminder error", err);
      throw err;
    }
  },
}));
