// src/modules/knowledge-base/KnowledgeBaseModule.tsx
// FULL + FINAL — Tier 4 + Phase 1 Governance
// Draft / Publish / Archive + AI-safe KB

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
  CheckCircle,
  Archive,
} from "lucide-react";

import { useKnowledgeBaseStore } from "../../state/useKnowledgeBaseStore";
import { useOrganizationStore } from "../../state/useOrganizationStore";
import type { KnowledgeArticle } from "../../types/database";

/* -----------------------------------------------------------
 * TYPES
 * -----------------------------------------------------------*/
type ArticleStatus = "draft" | "published" | "archived";

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

  const { activeOrganization } = useOrganizationStore();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const replaceFileInputRef = useRef<HTMLInputElement | null>(null);

  const [showManualForm, setShowManualForm] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualContent, setManualContent] = useState("");
  const [editMode, setEditMode] = useState(false);

  const [confirmReplaceOpen, setConfirmReplaceOpen] = useState(false);

  /* -----------------------------------------------------------
   * Load on org / sub-org change
   * -----------------------------------------------------------*/
  useEffect(() => {
    if (!activeOrganization) return;
    fetchArticles();
    setSelectedArticle(null);
  }, [activeOrganization?.id]);

  /* -----------------------------------------------------------
   * ORDER — DIVISION FIRST
   * -----------------------------------------------------------*/
  

  /* -----------------------------------------------------------
   * Manual Create / Update (DRAFT BY DEFAULT)
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
        status: "draft",
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
    await createArticleFromFile({
      file,
      title: file.name,
      status: "draft",
    });
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
            Articles ({articles.length})
          </h2>

          {loading || uploading ? (
            <div className="flex items-center gap-2 py-6 text-slate-500">
              <Loader2 size={16} className="animate-spin" />
              Processing…
            </div>
          ) : (
            <ul className="space-y-2">
              {articles.map((a) => (
                <li
                  key={a.id}
                  onClick={() => setSelectedArticle(a)}
                  className="cursor-pointer rounded-md border border-slate-200 bg-slate-50 px-3 py-2 hover:bg-slate-100"
                >
                  <p className="font-medium">{a.title}</p>
                  <div className="mt-1 flex gap-2 flex-wrap text-[10px]">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5">
                      {a.source_type === "file" ? "PDF / Excel" : "Text"}
                    </span>

                    <span
                      className={`rounded-full px-2 py-0.5 ${
                        a.status === "published"
                          ? "bg-green-50 text-green-700"
                          : a.status === "draft"
                          ? "bg-yellow-50 text-yellow-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {a.status}
                    </span>
                  </div>
                </li>
              ))}
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
              <div className="border-b border-slate-200 bg-white px-6 py-4 flex justify-between">
                <h2 className="text-lg font-semibold">
                  {selectedArticle.title}
                </h2>

                <div className="flex gap-2">
                  {selectedArticle.status !== "published" && (
                    <button
                      onClick={() =>
                        updateArticle({
                          id: selectedArticle.id,
                          status: "published",
                          published_at: new Date().toISOString(),
                        })
                      }
                      className="flex items-center gap-1 rounded-md bg-green-600 px-3 py-1 text-xs text-white"
                    >
                      <CheckCircle size={14} />
                      Publish
                    </button>
                  )}

                  {selectedArticle.status === "published" && (
                    <button
                      onClick={() =>
                        updateArticle({
                          id: selectedArticle.id,
                          status: "archived",
                        })
                      }
                      className="flex items-center gap-1 rounded-md bg-slate-600 px-3 py-1 text-xs text-white"
                    >
                      <Archive size={14} />
                      Archive
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4 text-sm whitespace-pre-wrap">
                {selectedArticle.content}
              </div>
            </div>
          )}

          {/* CREATE / EDIT */}
          {showManualForm && (
            <div className="flex h-full flex-col">
              <form
                onSubmit={handleManualSubmit}
                className="flex-1 space-y-4 px-6 py-4"
              >
                <input
                  type="text"
                  placeholder="Article title"
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />

                <textarea
                  placeholder="Enter content..."
                  value={manualContent}
                  onChange={(e) => setManualContent(e.target.value)}
                  rows={12}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />

                <button
                  type="submit"
                  className="rounded-md bg-blue-600 px-6 py-2 text-sm text-white"
                >
                  {editMode ? "Update Draft" : "Save Draft"}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">Error: {error}</p>}
    </div>
  );
}