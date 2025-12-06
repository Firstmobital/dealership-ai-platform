// src/modules/unanswered/UnansweredQuestionsModule.tsx

import { useEffect, useState } from "react";
import {
  BookOpen,
  FileText,
  Loader2,
  Trash2,
  XCircle,
} from "lucide-react";

import { useUnansweredQuestionsStore } from "../../state/useUnansweredQuestionsStore";
import { useOrganizationStore } from "../../state/useOrganizationStore";
import { useSubOrganizationStore } from "../../state/useSubOrganizationStore";
import type { UnansweredQuestion } from "../../types/database";

export function UnansweredQuestionsModule() {
  const {
    questions,
    loading,
    saving,
    error,
    fetchUnanswered,
    saveToKnowledge,
    deleteQuestion,
  } = useUnansweredQuestionsStore();

  const { currentOrganization } = useOrganizationStore();
  const { activeSubOrg } = useSubOrganizationStore();

  // Local UI state
  const [selected, setSelected] = useState<UnansweredQuestion | null>(null);
  const [kbTitle, setKbTitle] = useState("");
  const [kbSummary, setKbSummary] = useState("");

  // Fetch unanswered on org/sub-org change
  useEffect(() => {
    if (!currentOrganization) return;
    fetchUnanswered().catch(console.error);
    setSelected(null);
  }, [currentOrganization?.id, activeSubOrg?.id]);

  const handleSaveToKnowledge = async () => {
    if (!selected) return;

    await saveToKnowledge({
      questionId: selected.id,
      title: kbTitle || undefined,
      summary: kbSummary || undefined,
    });

    // Reset UI
    setSelected(null);
    setKbTitle("");
    setKbSummary("");
  };

  const handleDelete = async (q: UnansweredQuestion) => {
    if (!window.confirm("Delete this unanswered question?")) return;
    await deleteQuestion(q.id);

    if (selected?.id === q.id) {
      setSelected(null);
    }
  };

  return (
    <div className="flex h-full flex-col px-6 py-6 text-slate-200">
      {/* Header */}
      <div className="mb 6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Unanswered Questions</h1>
          <p className="text-sm text-slate-400">
            View messages the AI could not answer and save them to your Knowledge Base.
          </p>
        </div>
      </div>

      {/* Layout */}
      <div className="flex flex-1 gap-6 overflow-hidden">
        {/* Left: list */}
        <div className="w-1/3 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-4">
          <h2 className="mb-3 text-sm font-semibold text-white">
            Unanswered ({questions.length})
          </h2>

          {loading ? (
            <div className="flex items-center gap-2 py-6 text-slate-400">
              <Loader2 className="animate-spin" size={16} />
              Loading...
            </div>
          ) : questions.length === 0 ? (
            <p className="py-6 text-sm text-slate-500">
              No unanswered questions. Great job!
            </p>
          ) : (
            <ul className="space-y-3">
              {questions.map((q) => {
                const isSelected = selected?.id === q.id;
                return (
                  <li
                    key={q.id}
                    className={`cursor-pointer rounded-md border px-3 py-2 text-sm transition
                      ${
                        isSelected
                          ? "border-accent bg-accent/20 text-accent"
                          : "border-slate-700 bg-slate-950 hover:bg-slate-800"
                      }`}
                    onClick={() => setSelected(q)}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium line-clamp-1">{q.question}</p>

                      <button
                        className="text-slate-400 hover:text-red-400"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(q);
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <p className="mt-1 text-xs text-slate-400">
                    {q.created_at
                      ? new Date(q.created_at).toLocaleString()
                      : "—"}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Right: details + save-to-KB */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 p-4">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center text-slate-500">
              Select a question to convert it into Knowledge.
            </div>
          ) : (
            <div className="flex flex-col overflow-y-auto">
              <div className="flex items-start justify-between">
                <h2 className="text-lg font-semibold text-white">
                  Unanswered Question
                </h2>

                <button
                  onClick={() => setSelected(null)}
                  className="text-slate-400 hover:text-slate-200"
                >
                  <XCircle size={20} />
                </button>
              </div>

              <p className="mt-4 whitespace-pre-wrap text-sm text-slate-300">
                {selected.question}
              </p>

              {/* Convert form */}
              <div className="mt-6 rounded-lg border border-slate-700 bg-slate-800 p-4">
                <h3 className="mb-3 text-sm font-semibold text-white flex gap-2 items-center">
                  <BookOpen size={16} /> Save to Knowledge Base
                </h3>

                <div className="space-y-4">
                  <input
                    type="text"
                    placeholder="KB Article Title (optional)"
                    value={kbTitle}
                    onChange={(e) => setKbTitle(e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  />

                  <textarea
                    placeholder="Short summary for the article (optional)"
                    value={kbSummary}
                    onChange={(e) => setKbSummary(e.target.value)}
                    rows={3}
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  />

                  <button
                    onClick={handleSaveToKnowledge}
                    disabled={saving}
                    className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {saving ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <FileText size={16} />
                    )}
                    Save to Knowledge Base
                  </button>
                </div>
              </div>

              <p className="mt-6 text-xs text-slate-500">
                ID: {selected.id}
              </p>
              <p className="text-xs text-slate-500">
                Created:
                {selected.created_at
                  ? new Date(selected.created_at).toLocaleString()
                  : " —"}
              </p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-4 text-sm text-red-400">Error: {error}</p>
      )}
    </div>
  );
}
