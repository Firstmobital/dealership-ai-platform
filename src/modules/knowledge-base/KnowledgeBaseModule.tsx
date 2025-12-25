// src/modules/knowledge-base/KnowledgeBaseModule.tsx
// FULL + FINAL — Tier 4
// Bright CRM Knowledge Base UI
// Replace confirm + Last processed display + Download/Replace/Error visibility

import { useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  Loader2,
  Search,
  Trash2,
  X,
  Plus,
  File,
  Pencil,
  Download,
  RefreshCcw,
  AlertTriangle,
} from "lucide-react";

import { useKnowledgeBaseStore } from "../../state/useKnowledgeBaseStore";
import { useOrganizationStore } from "../../state/useOrganizationStore";
import { useSubOrganizationStore } from "../../state/useSubOrganizationStore";
import type { KnowledgeArticle } from "../../types/database";

/* -----------------------------------------------------------
 * AddNewArticleDropdown
 * -----------------------------------------------------------*/
function AddNewArticleDropdown({
  onManual,
  onFile,
}: {
  onManual: () => void;
  onFile: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        <Plus size={16} />
        New
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-44 rounded-md border border-slate-200 bg-white shadow-lg">
          <button
            onClick={() => {
              setOpen(false);
              onManual();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-100"
          >
            <FileText size={16} />
            Manual Text
          </button>

          <button
            onClick={() => {
              setOpen(false);
              onFile();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-100"
          >
            <File size={16} />
            PDF / Excel
          </button>
        </div>
      )}
    </div>
  );
}

/* -----------------------------------------------------------
 * MAIN MODULE
 * -----------------------------------------------------------*/
export function KnowledgeBaseModule() {
  const {
    articles,
    loading,
    uploading,
    error,
    fetchArticles,
    createArticleFromText,
    createArticleFromFile,
    replaceFileForArticle,
    downloadOriginalFile,
    updateArticle,
    deleteArticle,
    selectedArticle,
    setSelectedArticle,
    searchTerm,
    setSearchTerm,
  } = useKnowledgeBaseStore();

  const { currentOrganization } = useOrganizationStore();
  const { activeSubOrg } = useSubOrganizationStore();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const replaceFileInputRef = useRef<HTMLInputElement | null>(null);

  const [showManualForm, setShowManualForm] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualContent, setManualContent] = useState("");
  const [editMode, setEditMode] = useState(false);

  // ✅ NEW: confirm replace modal
  const [confirmReplaceOpen, setConfirmReplaceOpen] = useState(false);

  /* -----------------------------------------------------------
   * Load on org / sub-org change
   * -----------------------------------------------------------*/
  useEffect(() => {
    if (!currentOrganization) return;
    fetchArticles();
    setSelectedArticle(null);
  }, [currentOrganization?.id, activeSubOrg?.id]);

  /* -----------------------------------------------------------
   * ORDER — DIVISION FIRST, ORG FALLBACK NEXT
   * -----------------------------------------------------------*/
  const orderedArticles = useMemo(() => {
    if (!activeSubOrg) return articles;

    return [...articles].sort((a, b) => {
      const aLocal = a.sub_organization_id === activeSubOrg.id;
      const bLocal = b.sub_organization_id === activeSubOrg.id;

      if (aLocal && !bLocal) return -1;
      if (!aLocal && bLocal) return 1;
      return 0;
    });
  }, [articles, activeSubOrg]);

  /* -----------------------------------------------------------
   * Manual Create / Update
   * -----------------------------------------------------------*/
  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!manualTitle.trim() || !manualContent.trim()) return;

    if (editMode && selectedArticle) {
      await updateArticle({
        id: selectedArticle.id,
        title: manualTitle.trim(),
        content: manualContent.trim(),
      });
    } else {
      await createArticleFromText({
        title: manualTitle.trim(),
        content: manualContent.trim(),
      });
    }

    resetManualForm();
  }

  function resetManualForm() {
    setShowManualForm(false);
    setEditMode(false);
    setManualTitle("");
    setManualContent("");
    setSelectedArticle(null);
  }

  /* -----------------------------------------------------------
   * File Upload / Replace
   * -----------------------------------------------------------*/
  async function handleFileSelected(file: File) {
    await createArticleFromFile({ file, title: file.name });
  }

  async function handleReplaceFile(file: File) {
    if (!selectedArticle) return;
    await replaceFileForArticle({ article: selectedArticle, file });
  }

  /* -----------------------------------------------------------
   * Delete
   * -----------------------------------------------------------*/
  async function handleDelete(article: KnowledgeArticle) {
    if (!confirm(`Delete article "${article.title}"?`)) return;
    await deleteArticle(article.id);
    setSelectedArticle(null);
  }

  /* -----------------------------------------------------------
   * Edit (TEXT ONLY)
   * -----------------------------------------------------------*/
  function handleEdit(article: KnowledgeArticle) {
    if (article.source_type !== "text") return;

    setManualTitle(article.title);
    setManualContent(article.content);
    setEditMode(true);
    setShowManualForm(true);
    setSelectedArticle(article);
  }

  /* -----------------------------------------------------------
   * Helpers
   * -----------------------------------------------------------*/
  function formatDateTime(d?: string | null) {
    if (!d) return null;
    try {
      return new Date(d).toLocaleString();
    } catch {
      return d;
    }
  }

  /* -----------------------------------------------------------
   * UI
   * -----------------------------------------------------------*/
  return (
    <div className="flex h-full flex-col px-6 py-6 text-slate-900">
      {/* HEADER */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Knowledge Base</h1>
          <p className="text-sm text-slate-500">
            AI training library — text, PDFs, and Excel files.
          </p>
        </div>

        <AddNewArticleDropdown
          onManual={() => {
            setShowManualForm(true);
            setEditMode(false);
            setManualTitle("");
            setManualContent("");
          }}
          onFile={() => fileInputRef.current?.click()}
        />

        {/* Hidden file inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.xls,.xlsx,.csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileSelected(file);
            e.target.value = "";
          }}
        />

        <input
          ref={replaceFileInputRef}
          type="file"
          accept=".pdf,.xls,.xlsx,.csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleReplaceFile(file);
            e.target.value = "";
          }}
        />
      </div>

      {/* SEARCH */}
      <div className="mb-4 flex items-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
        <Search size={18} className="text-slate-400" />
        <input
          type="text"
          placeholder="Search articles..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            fetchArticles();
          }}
          className="ml-2 w-full bg-transparent outline-none"
        />
      </div>

      {/* MAIN */}
      <div className="flex h-full gap-4 overflow-hidden">
        {/* LEFT — ARTICLES */}
        <div className="w-[35%] overflow-y-auto rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold">
            Articles ({orderedArticles.length})
          </h2>

          {loading || uploading ? (
            <div className="flex items-center gap-2 py-6 text-slate-500">
              <Loader2 size={16} className="animate-spin" />
              Processing…
            </div>
          ) : orderedArticles.length === 0 ? (
            <p className="py-6 text-sm text-slate-500">
              No knowledge articles yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {orderedArticles.map((a) => {
                const isSelected = selectedArticle?.id === a.id;
                const isLocal =
                  activeSubOrg &&
                  a.sub_organization_id === activeSubOrg.id;

                return (
                  <li
                    key={a.id}
                    onClick={() => setSelectedArticle(a)}
                    className={[
                      "cursor-pointer rounded-md border px-3 py-2 text-sm transition",
                      isSelected
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-slate-50 hover:bg-slate-100",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{a.title}</p>

                        <div className="mt-1 flex gap-2 flex-wrap">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                            {a.source_type === "file" ? "PDF / Excel" : "Text"}
                          </span>

                          {a.processing_error && (
                            <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] text-red-700">
                              <AlertTriangle size={10} />
                              Error
                            </span>
                          )}

                          {activeSubOrg && (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] ${
                                isLocal
                                  ? "bg-green-50 text-green-700"
                                  : "bg-amber-50 text-amber-700"
                              }`}
                            >
                              {isLocal ? "This Division" : "From Organization"}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        {a.source_type === "text" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(a);
                            }}
                            className="text-slate-400 hover:text-blue-600"
                          >
                            <Pencil size={15} />
                          </button>
                        )}

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(a);
                          }}
                          className="text-slate-400 hover:text-red-600"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* RIGHT — CONTENT */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
          {!selectedArticle && !showManualForm && (
            <div className="flex flex-1 items-center justify-center text-slate-500">
              Select an article or click “New”
            </div>
          )}

          {/* VIEW */}
          {selectedArticle && !showManualForm && (
            <div className="flex h-full flex-col overflow-hidden">
              <div className="border-b border-slate-200 bg-white px-6 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold">
                      {selectedArticle.title}
                    </h2>
                    {selectedArticle.source_type === "file" &&
                      selectedArticle.original_filename && (
                        <p className="mt-1 truncate text-xs text-slate-500">
                          File: {selectedArticle.original_filename}
                        </p>
                      )}
                  </div>

                  <div className="flex shrink-0 gap-2">
                    {selectedArticle.source_type === "file" && (
                      <>
                        <button
                          onClick={() => downloadOriginalFile(selectedArticle)}
                          className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-slate-50"
                        >
                          <Download size={14} />
                          Download
                        </button>

                        <button
                          onClick={() => setConfirmReplaceOpen(true)}
                          className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-slate-50"
                        >
                          <RefreshCcw size={14} />
                          Replace
                        </button>
                      </>
                    )}

                    <button
                      onClick={() => setSelectedArticle(null)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4 text-sm whitespace-pre-wrap">
                {selectedArticle.processing_error && (
                  <div className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                    <strong>Processing failed:</strong>
                    <br />
                    {selectedArticle.processing_error}
                  </div>
                )}

                {selectedArticle.content}
              </div>

              {/* ✅ Footer: Created + Last processed + Source */}
              <div className="border-t border-slate-200 px-6 py-3 text-xs text-slate-500 space-y-1">
                <div>ID: {selectedArticle.id}</div>

                <div>
                  Created:{" "}
                  {new Date(selectedArticle.created_at).toLocaleString()}
                </div>

                {selectedArticle.last_processed_at && (
                  <div>
                    Last processed: {formatDateTime(selectedArticle.last_processed_at)}
                  </div>
                )}

                <div>
                  Source:{" "}
                  {selectedArticle.source_type === "file"
                    ? "PDF / Excel"
                    : "Manual Text"}
                </div>
              </div>
            </div>
          )}

          {/* CREATE / EDIT */}
          {showManualForm && (
            <div className="flex h-full flex-col overflow-hidden">
              <div className="border-b border-slate-200 bg-white px-6 py-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">
                    {editMode ? "Edit Article" : "New Article"}
                  </h2>
                  <button
                    onClick={resetManualForm}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4">
                <form
                  onSubmit={handleManualSubmit}
                  className="max-w-2xl space-y-4"
                >
                  <input
                    type="text"
                    placeholder="Article title"
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />

                  <textarea
                    placeholder="Enter content..."
                    value={manualContent}
                    onChange={(e) => setManualContent(e.target.value)}
                    rows={12}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />

                  <button
                    type="submit"
                    className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    {editMode ? "Update Article" : "Save Article"}
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ✅ Confirm Replace Modal */}
      {confirmReplaceOpen && selectedArticle?.source_type === "file" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-slate-900">
              Replace file?
            </h3>

            <p className="mt-2 text-sm text-slate-600">
              This will overwrite existing extracted knowledge for{" "}
              <span className="font-medium">{selectedArticle.title}</span>.
              Old chunks/embeddings will be removed and new data will replace it.
            </p>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmReplaceOpen(false)}
                className="rounded-md border px-4 py-2 text-sm"
              >
                Cancel
              </button>

              <button
                onClick={() => {
                  setConfirmReplaceOpen(false);
                  replaceFileInputRef.current?.click();
                }}
                className="rounded-md bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
              >
                Replace
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-4 text-sm text-red-600">Error: {error}</p>
      )}
    </div>
  );
}

