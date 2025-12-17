// src/modules/unanswered/UnansweredQuestionsModule.tsx
// Tier 11 — Final UI (Bright CRM Theme)
// Logic untouched, UI cleaned

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

  /* ------------------------------------------------------------------ */
  /* LOAD                                                               */
  /* ------------------------------------------------------------------ */
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

  /* ------------------------------------------------------------------ */
  /* UI                                                                 */
  /* ------------------------------------------------------------------ */

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

      {/* Main layout */}
      <div className="flex flex-1 gap-6 overflow-hidden">
        {/* LEFT — QUESTIONS LIST */}
        <div className="w-[360px] flex-shrink-0 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
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
              {questions.map((q) => {
                const isSelected = selected?.id === q.id;

                return (
                  <li
                    key={q.id}
                    onClick={() => setSelected(q)}
                    className={`cursor-pointer rounded-lg border p-3 transition ${
                      isSelected
                        ? "border-blue-500 bg-blue-50"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium line-clamp-2">
                        {q.question}
                      </p>

                      <button
                        className="text-slate-400 hover:text-red-500"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(q);
                        }}
                      >
                        <Trash2 size={14} />
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

        {/* RIGHT — DETAILS */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-6">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center text-slate-400">
              Select a question to review and save it to Knowledge Base.
            </div>
          ) : (
            <div className="flex flex-1 flex-col overflow-y-auto">
              {/* Header */}
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Question Details</h2>
                <button
                  onClick={() => setSelected(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <XCircle size={20} />
                </button>
              </div>

              {/* Question */}
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="whitespace-pre-wrap text-sm text-slate-700">
                  {selected.question}
                </p>
              </div>

              {/* Convert to KB */}
              <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <BookOpen size={16} className="text-blue-600" />
                  Save to Knowledge Base
                </h3>

                <div className="space-y-4">
                  <input
                    type="text"
                    placeholder="Article title (optional)"
                    value={kbTitle}
                    onChange={(e) => setKbTitle(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                  />

                  <textarea
                    placeholder="Short summary (optional)"
                    value={kbSummary}
                    onChange={(e) => setKbSummary(e.target.value)}
                    rows={3}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                  />

                  <button
                    onClick={handleSaveToKnowledge}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
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

              {/* Meta */}
              <div className="mt-6 text-xs text-slate-500">
                <div>ID: {selected.id}</div>
                <div>
                  Created:{" "}
                  {selected.created_at
                    ? new Date(selected.created_at).toLocaleString()
                    : "—"}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 text-sm text-red-600">Error: {error}</div>
      )}
    </div>
  );
}
