// src/modules/unanswered/UnansweredQuestionsModule.tsx

import { useEffect, useState } from "react";
import {
  BookOpen,
  FileText,
  Loader2,
  Trash2,
  XCircle,
  HelpCircle,
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

  const [selected, setSelected] = useState<UnansweredQuestion | null>(null);
  const [kbTitle, setKbTitle] = useState("");
  const [kbSummary, setKbSummary] = useState("");

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

    setSelected(null);
    setKbTitle("");
    setKbSummary("");
  };

  const handleDelete = async (q: UnansweredQuestion) => {
    if (!window.confirm("Delete this unanswered question?")) return;
    await deleteQuestion(q.id);
    if (selected?.id === q.id) setSelected(null);
  };

  return (
    <div className="flex h-full flex-col px-6 py-6 bg-slate-50 text-slate-900">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
          <HelpCircle size={20} />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Unanswered Questions</h1>
          <p className="text-sm text-slate-500">
            Questions customers asked that the AI could not answer.
          </p>
        </div>
      </div>

      <div className="flex flex-1 gap-6 overflow-hidden">
        {/* LEFT */}
        <div className="w-[360px] overflow-y-auto rounded-xl border bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold">
            Questions ({questions.length})
          </h2>

          {loading ? (
            <div className="flex items-center gap-2 py-6 text-slate-500">
              <Loader2 className="animate-spin" size={16} />
              Loading…
            </div>
          ) : questions.length === 0 ? (
            <p className="py-6 text-sm text-slate-500">
              🎉 No unanswered questions found.
            </p>
          ) : (
            <ul className="space-y-2">
              {questions.map((q: UnansweredQuestion) => (
                <li
                  key={q.id}
                  onClick={() => setSelected(q)}
                  className={`cursor-pointer rounded-lg border p-3 ${
                    selected?.id === q.id
                      ? "border-blue-500 bg-blue-50"
                      : "hover:bg-slate-50"
                  }`}
                >
                  <div className="flex justify-between gap-2">
                    <p className="text-sm font-medium line-clamp-2">
                      {q.question}
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(q);
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* RIGHT */}
        <div className="flex-1 rounded-xl border bg-white p-6">
          {!selected ? (
            <div className="flex h-full items-center justify-center text-slate-400">
              Select a question to review.
            </div>
          ) : (
            <>
              <div className="flex justify-between">
                <h2 className="font-semibold">Question Details</h2>
                <button onClick={() => setSelected(null)}>
                  <XCircle size={18} />
                </button>
              </div>

              <div className="mt-4 rounded border bg-slate-50 p-4">
                {selected.question}
              </div>

              <div className="mt-4">
                <input
                  placeholder="KB title"
                  value={kbTitle}
                  onChange={(e) => setKbTitle(e.target.value)}
                  className="w-full mb-2 rounded border px-3 py-2"
                />
                <textarea
                  placeholder="Summary"
                  value={kbSummary}
                  onChange={(e) => setKbSummary(e.target.value)}
                  className="w-full rounded border px-3 py-2"
                />
                <button
                  onClick={handleSaveToKnowledge}
                  disabled={saving}
                  className="mt-3 flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-white"
                >
                  {saving ? <Loader2 size={14} /> : <FileText size={14} />}
                  Save to Knowledge Base
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {error && <div className="mt-4 text-sm text-red-600">{error}</div>}
    </div>
  );
}
