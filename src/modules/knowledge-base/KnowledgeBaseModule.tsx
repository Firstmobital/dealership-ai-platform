// src/modules/knowledge-base/KnowledgeBaseModule.tsx
// FULL + FINAL — Tier 4
// Bright CRM Knowledge Base UI
// Logic untouched

import { useEffect, useState } from "react";
import {
  FileText,
  Loader2,
  Search,
  Trash2,
  X,
  Plus,
  Link,
  File,
  Pencil,
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
  onUrl,
  onPdf,
}: {
  onManual: () => void;
  onUrl: () => void;
  onPdf: () => void;
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
        <div className="absolute right-0 mt-2 w-40 rounded-md border border-slate-200 bg-white shadow-lg">
          <button
            onClick={() => {
              setOpen(false);
              onManual();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-100"
          >
            <FileText size={16} />
            Manual
          </button>

          <button
            onClick={() => {
              setOpen(false);
              onUrl();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-100"
          >
            <Link size={16} />
            URL
          </button>

          <button
            onClick={() => {
              setOpen(false);
              onPdf();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-100"
          >
            <File size={16} />
            PDF
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
    error,
    fetchArticles,
    createArticleFromText,
    updateArticle,
    deleteArticle,
    selectedArticle,
    setSelectedArticle,
    searchTerm,
    setSearchTerm,
  } = useKnowledgeBaseStore();

  const { currentOrganization } = useOrganizationStore();
  const { activeSubOrg } = useSubOrganizationStore();

  const [showManualForm, setShowManualForm] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualContent, setManualContent] = useState("");
  const [editMode, setEditMode] = useState(false);

  /* -----------------------------------------------------------
   * Load on org / sub-org change
   * -----------------------------------------------------------*/
  useEffect(() => {
    if (!currentOrganization) return;
    fetchArticles();
    setSelectedArticle(null);
  }, [currentOrganization?.id, activeSubOrg?.id]);

  /* -----------------------------------------------------------
   * Create / Update
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

    setShowManualForm(false);
    setEditMode(false);
    setManualTitle("");
    setManualContent("");
    setSelectedArticle(null);
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
   * Edit
   * -----------------------------------------------------------*/
  function handleEdit(article: KnowledgeArticle) {
    setManualTitle(article.title);
    setManualContent(article.content);
    setEditMode(true);
    setShowManualForm(true);
    setSelectedArticle(article);
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
            Your AI training library — manage articles and knowledge.
          </p>
        </div>

        <AddNewArticleDropdown
          onManual={() => {
            setShowManualForm(true);
            setEditMode(false);
            setManualTitle("");
            setManualContent("");
          }}
          onUrl={() => alert("URL ingestion coming soon")}
          onPdf={() => alert("PDF ingestion coming soon")}
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
            Articles ({articles.length})
          </h2>

          {loading ? (
            <div className="flex items-center gap-2 py-6 text-slate-500">
              <Loader2 size={16} className="animate-spin" />
              Loading articles...
            </div>
          ) : articles.length === 0 ? (
            <p className="py-6 text-sm text-slate-500">
              No knowledge articles yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {articles.map((a) => {
                const isSelected = selectedArticle?.id === a.id;

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
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{a.title}</p>

                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(a);
                          }}
                          className="text-slate-400 hover:text-blue-600"
                        >
                          <Pencil size={15} />
                        </button>

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

          {/* CREATE / EDIT */}
          {showManualForm && (
            <div className="flex h-full flex-col overflow-hidden">
              <div className="border-b border-slate-200 bg-white px-6 py-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">
                    {editMode ? "Edit Article" : "New Article"}
                  </h2>
                  <button
                    onClick={() => {
                      setShowManualForm(false);
                      setEditMode(false);
                      setManualTitle("");
                      setManualContent("");
                    }}
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

          {/* VIEW */}
          {selectedArticle && !showManualForm && (
            <div className="flex h-full flex-col overflow-hidden">
              <div className="border-b border-slate-200 bg-white px-6 py-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">
                    {selectedArticle.title}
                  </h2>
                  <button
                    onClick={() => setSelectedArticle(null)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4 text-sm whitespace-pre-wrap">
                {selectedArticle.content}
              </div>

              <div className="border-t border-slate-200 px-6 py-3 text-xs text-slate-500">
                ID: {selectedArticle.id}
                <br />
                Created:{" "}
                {new Date(selectedArticle.created_at).toLocaleString()}
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-4 text-sm text-red-600">Error: {error}</p>
      )}
    </div>
  );
}
