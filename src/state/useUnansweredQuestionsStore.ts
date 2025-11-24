import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";
import type { UnansweredQuestion } from "../types/database";
import { useSubOrganizationStore } from "./useSubOrganizationStore";

type UnansweredState = {
  questions: UnansweredQuestion[];
  loading: boolean;

  fetchQuestions: (organizationId: string) => Promise<void>;
  deleteQuestion: (id: string) => Promise<void>;
};

export const useUnansweredQuestionsStore = create<UnansweredState>((set) => ({
  questions: [],
  loading: false,

  fetchQuestions: async (organizationId) => {
    const { activeSubOrg } = useSubOrganizationStore.getState();

    set({ loading: true });

    let query = supabase
      .from("unanswered_questions")
      .select("*")
      .eq("organization_id", organizationId)
      .order("occurrences", { ascending: false });

    if (activeSubOrg) {
      query = query.eq("sub_organization_id", activeSubOrg.id);
    } else {
      query = query.is("sub_organization_id", null);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[Unanswered] fetchQuestions:", error);
      set({ loading: false });
      return;
    }

    set({ questions: data ?? [], loading: false });
  },

  deleteQuestion: async (id) => {
    const { error } = await supabase
      .from("unanswered_questions")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("[Unanswered] deleteQuestion:", error);
      throw error;
    }

    set((state) => ({
      questions: state.questions.filter((q) => q.id !== id),
    }));
  },
}));
