// src/state/useUnansweredQuestionsStore.ts
import { create } from "zustand";
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

  ignoreQuestion: (questionId: string) => Promise<void>;
};

export const useUnansweredQuestionsStore = create<UnansweredQuestionsState>(
  (set, get) => ({
    questions: [],
    loading: false,
    saving: false,
    error: null,

    /* -------------------------------------------------- */
    /* FETCH — ONLY OPEN QUESTIONS                        */
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
          .eq("status", "open")
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
      } catch (err) {
        set({
          loading: false,
          error:
            err instanceof Error
              ? err.message
              : "Unexpected error while loading unanswered questions.",
          questions: [],
        });
      }
    },

    /* -------------------------------------------------- */
    /* SAVE TO KNOWLEDGE (ANSWER)                         */
    /* -------------------------------------------------- */
    saveToKnowledge: async ({ questionId, title, summary }) => {
      const { currentOrganization } = useOrganizationStore.getState();
      const { activeSubOrg } = useSubOrganizationStore.getState();

      if (!currentOrganization) {
        set({ error: "Select an organization before saving to Knowledge Base." });
        return;
      }

      set({ saving: true, error: null });

      try {
        const { data, error } = await supabase.functions.invoke(
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

        if (error || !data?.article_id) {
          set({
            saving: false,
            error: error?.message ?? "Failed to save unanswered question to KB.",
          });
          return;
        }

        // ✅ Mark question as answered
        await supabase
          .from("unanswered_questions")
          .update({
            status: "answered",
            resolution_article_id: data.article_id,
            resolved_at: new Date().toISOString(),
          })
          .eq("id", questionId)
          .eq("organization_id", currentOrganization.id);

        await get().fetchUnanswered();
        set({ saving: false, error: null });
      } catch (err) {
        set({
          saving: false,
          error:
            err instanceof Error
              ? err.message
              : "Unexpected error while saving unanswered question.",
        });
      }
    },

    /* -------------------------------------------------- */
    /* IGNORE (NOT DELETE)                                */
    /* -------------------------------------------------- */
    ignoreQuestion: async (questionId: string) => {
      const { currentOrganization } = useOrganizationStore.getState();

      if (!currentOrganization) {
        set({ error: "Select an organization first." });
        return;
      }

      set({ loading: true, error: null });

      try {
        const { error } = await supabase
          .from("unanswered_questions")
          .update({
            status: "ignored",
            resolved_at: new Date().toISOString(),
          })
          .eq("id", questionId)
          .eq("organization_id", currentOrganization.id);

        if (error) {
          set({
            loading: false,
            error: error.message ?? "Failed to ignore question.",
          });
          return;
        }

        await get().fetchUnanswered();
        set({ loading: false, error: null });
      } catch (err) {
        set({
          loading: false,
          error:
            err instanceof Error
              ? err.message
              : "Unexpected error while ignoring question.",
        });
      }
    },
  })
);
