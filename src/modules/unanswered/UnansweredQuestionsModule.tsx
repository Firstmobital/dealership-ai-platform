import { useEffect, useState } from "react";
import { Loader2, PlusCircle, Trash2, Save } from "lucide-react";

import { useUnansweredQuestionsStore } from "../../state/useUnansweredQuestionsStore";
import { useOrganizationStore } from "../../state/useOrganizationStore";
import { useSubOrganizationStore } from "../../state/useSubOrganizationStore";
import { supabase } from "../../lib/supabaseClient";

export function UnansweredQuestionsModule() {
  const { questions, loading, fetchQuestions, deleteQuestion } =
    useUnansweredQuestionsStore();

  const { currentOrganization } = useOrganizationStore();
  const { activeSubOrg } = useSubOrganizationStore();

  const [generating, setGenerating] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [generatedKB, setGeneratedKB] = useState<Record<string, string>>({});

  /* ------------------------------------------------------------------ */
  /* LOAD QUESTIONS WHEN ORG / SUB ORG CHANGES                          */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    if (currentOrganization?.id) {
      fetchQuestions(currentOrganization.id).catch(console.error);
    }
  }, [currentOrganization?.id, activeSubOrg?.id, fetchQuestions]);

  /* ------------------------------------------------------------------ */
  /* AI: GENERATE KB ARTICLE CONTENT                                    */
  /* ------------------------------------------------------------------ */
  async function handleGenerateKb(id: string, question: string) {
    if (!question.trim()) return;

    setGenerating(id);
    try {
      const { data, error } = await supabase.functions.invoke(
        "ai-generate-kb",
        {
          body: { question },
        }
      );

      if (error) {
        console.error("[Unanswered] ai-generate-kb error:", error);
        alert("Failed to generate KB content.");
        return;
      }

      const content = (data as any)?.content ?? "";
      setGeneratedKB((prev) => ({
        ...prev,
        [id]: content,
      }));
    } catch (err) {
      console.error("[Unanswered] ai-generate-kb exception:", err);
      alert("Error while generating KB content.");
    } finally {
      setGenerating(null);
    }
  }

  /* ------------------------------------------------------------------ */
  /* SAVE AS KNOWLEDGE ARTICLE                                          */
  /* ------------------------------------------------------------------ */
  async function handleSaveAsKb(
    id: string,
    question: string,
  ) {
    if (!currentOrganization?.id) {
      alert("No organization selected.");
      return;
    }

    const content = generatedKB[id];
    if (!content || !content.trim()) {
      alert("Generate an AI answer first before saving as KB.");
      return;
    }

    setSaving(id);
    try {
      const { data, error } = await supabase.functions.invoke(
        "kb-save-from-unanswered",
        {
          body: {
            organization_id: currentOrganization.id,
            sub_organization_id: activeSubOrg?.id ?? null,
            question,
            content,
          },
        }
      );

      if (error) {
        console.error("[Unanswered] kb-save-from-unanswered error:", error);
        alert("Failed to save KB article.");
        return;
      }

      const articleId = (data as any)?.article_id;
      console.log("[Unanswered] KB article created:", articleId);

      // Optional: auto-remove unanswered question once covered by KB
      await deleteQuestion(id);

      alert("KB article created and question removed from list.");
    } catch (err) {
      console.error("[Unanswered] kb-save-from-unanswered exception:", err);
      alert("Error while saving KB article.");
    } finally {
      setSaving(null);
    }
  }

  /* ------------------------------------------------------------------ */
  /* RENDER                                                             */
  /* ------------------------------------------------------------------ */
  return (
    <div className="p-6 text-white h-full overflow-y-auto">
      <h2 className="text-xl font-semibold mb-4">Unanswered Questions</h2>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400">
          <Loader2 className="animate-spin" size={16} />
          <span>Loading…</span>
        </div>
      ) : (
        <div className="space-y-4">
          {questions.length === 0 && (
            <div className="text-slate-500 text-sm">
              No unanswered questions 🎉
            </div>
          )}

          {questions.map((q) => {
            const kbContent = generatedKB[q.id] ?? "";

            return (
              <div
                key={q.id}
                className="rounded-lg border border-white/10 bg-slate-900/50 p-4"
              >
                <div className="text-sm text-slate-200 mb-1">
                  {q.question}
                </div>

                <div className="text-xs text-slate-500 mb-3">
                  Occurrences: {q.occurrences}
                </div>

                {/* AI Suggested KB Content */}
                {kbContent && (
                  <div className="mb-3">
                    <div className="text-xs text-emerald-300 mb-1">
                      AI Suggested KB Answer:
                    </div>
                    <textarea
                      className="w-full bg-slate-800 px-2 py-2 text-xs rounded border border-white/10"
                      rows={5}
                      value={kbContent}
                      onChange={(e) =>
                        setGeneratedKB((prev) => ({
                          ...prev,
                          [q.id]: e.target.value,
                        }))
                      }
                    />
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={generating === q.id}
                    onClick={() => handleGenerateKb(q.id, q.question)}
                    className="inline-flex items-center gap-1 rounded bg-accent px-3 py-1.5 text-xs font-medium disabled:opacity-60"
                  >
                    {generating === q.id ? (
                      <Loader2 className="animate-spin" size={14} />
                    ) : (
                      <PlusCircle size={14} />
                    )}
                    Generate AI Answer
                  </button>

                  <button
                    type="button"
                    disabled={saving === q.id || !kbContent.trim()}
                    onClick={() => handleSaveAsKb(q.id, q.question)}
                    className="inline-flex items-center gap-1 rounded bg-emerald-600/80 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                  >
                    {saving === q.id ? (
                      <Loader2 className="animate-spin" size={14} />
                    ) : (
                      <Save size={14} />
                    )}
                    Save as KB Article
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteQuestion(q.id)}
                    className="inline-flex items-center gap-1 rounded bg-red-600/70 px-3 py-1.5 text-xs font-medium"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
