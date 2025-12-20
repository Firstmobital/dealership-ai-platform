// src/state/useUnansweredQuestionsStore.ts

import { create } from "zustand"; // ✅ FIXED
import { supabase } from "../lib/supabaseClient";
import { useOrganizationStore } from "./useOrganizationStore";
import { useSubOrganizationStore } from "./useSubOrganizationStore";
import type { UnansweredQuestion } from "../types/database";

type UnansweredQuestionsState = {
  questions: UnansweredQuestion[];
  loading: boolean;
  saving: boolean;
  error: string | null;

  fetchUnanswered: () => Promise<void>;
  saveToKnowledge: (params: {
    questionId: string;
    title?: string;
    summary?: string;
  }) => Promise<void>;
  deleteQuestion: (questionId: string) => Promise<void>;
};

export const useUnansweredQuestionsStore = create<UnansweredQuestionsState>(
  (set, get) => ({
    questions: [],
    loading: false,
    saving: false,
    error: null,

    /* -------------------------------------------------- */
    /* FETCH                                              */
    /* -------------------------------------------------- */
    fetchUnanswered: async () => {
      const { currentOrganization } = useOrganizationStore.getState();
      const { activeSubOrg } = useSubOrganizationStore.getState();

      if (!currentOrganization) {
        set({
          error: "Select an organization to view unanswered questions.",
          questions: [],
        });
        return;
      }

      set({ loading: true, error: null });

      try {
        let query = supabase
          .from("unanswered_questions")
          .select("*")
          .eq("organization_id", currentOrganization.id)
          .order("created_at", { ascending: false });

        if (activeSubOrg) {
          query = query.eq("sub_organization_id", activeSubOrg.id);
        } else {
          query = query.is("sub_organization_id", null);
        }

        const { data, error } = await query;

        if (error) {
          set({
            loading: false,
            error: error.message ?? "Failed to load unanswered questions.",
            questions: [],
          });
          return;
        }

        set({
          loading: false,
          error: null,
          questions: (data ?? []) as UnansweredQuestion[],
        });
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "Unexpected error while loading unanswered questions.";

        set({
          loading: false,
          error: message,
          questions: [],
        });
      }
    },

    /* -------------------------------------------------- */
    /* SAVE TO KNOWLEDGE                                  */
    /* -------------------------------------------------- */
    saveToKnowledge: async ({ questionId, title, summary }) => {
      const { currentOrganization } = useOrganizationStore.getState();
      const { activeSubOrg } = useSubOrganizationStore.getState();

      if (!currentOrganization) {
        set({
          error: "Select an organization before saving to Knowledge Base.",
        });
        return;
      }

      set({ saving: true, error: null });

      try {
        const { error } = await supabase.functions.invoke(
          "kb-save-from-unanswered",
          {
            body: {
              organization_id: currentOrganization.id,
              sub_organization_id: activeSubOrg?.id ?? null,
              question_id: questionId,
              title: title || undefined,
              summary: summary || undefined,
            },
          }
        );

        if (error) {
          set({
            saving: false,
            error: error.message ?? "Failed to save unanswered question to KB.",
          });
          return;
        }

        await get().fetchUnanswered();
        set({ saving: false, error: null });
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "Unexpected error while saving unanswered question to KB.";

        set({
          saving: false,
          error: message,
        });
      }
    },

    /* -------------------------------------------------- */
    /* DELETE                                             */
    /* -------------------------------------------------- */
    deleteQuestion: async (questionId: string) => {
      const { currentOrganization } = useOrganizationStore.getState();

      if (!currentOrganization) {
        set({ error: "Select an organization first." });
        return;
      }

      set({ loading: true, error: null });

      try {
        const { error } = await supabase
          .from("unanswered_questions")
          .delete()
          .eq("id", questionId)
          .eq("organization_id", currentOrganization.id);

        if (error) {
          set({
            loading: false,
            error: error.message ?? "Failed to delete unanswered question.",
          });
          return;
        }

        await get().fetchUnanswered();
        set({ loading: false, error: null });
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "Unexpected error while deleting unanswered question.";

        set({
          loading: false,
          error: message,
        });
      }
    },
  })
);
