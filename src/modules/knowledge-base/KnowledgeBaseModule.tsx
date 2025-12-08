// src/modules/knowledge-base/KnowledgeBaseModule.tsx

import { useEffect, useRef, useState } from "react";
import {
  FileUp,
  FileText,
  Loader2,
  Search,
  Trash2,
  X,
  Plus,
  Link,
  File,
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
      {/* + New Button */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white"
      >
        <Plus size={16} />
        New
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-40 rounded-md border border-slate-200 bg-white shadow-lg dark:border-white/10 dark:bg-slate-800">
          <button
            onClick={() => {
              setOpen(false);
              onManual();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <FileText size={16} />
            Manual
          </button>

          <button
            onClick={() => {
              setOpen(false);
              onUrl();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Link size={16} />
            URL
          </button>

          <button
            onClick={() => {
              setOpen(false);
              onPdf();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
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
    uploading,
    error,
    fetchArticles,
    createArticleFromText,
    createArticleFromFile,
    deleteArticle,
    setSelectedArticle,
    selectedArticle,
    searchTerm,
    setSearchTerm,
  } = useKnowledgeBaseStore();

  const { currentOrganization } = useOrganizationStore();
  const { activeSubOrg } = useSubOrganizationStore();

  const [showManualForm, setShowManualForm] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualContent, setManualContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /* -----------------------------------------------------------
   * Load KB on org/sub-org change
   * -----------------------------------------------------------*/
  useEffect(() => {
    if (!currentOrganization) return;
    fetchArticles().catch(console.error);
    setSelectedArticle(null);
  }, [currentOrganization?.id, activeSubOrg?.id]);

  /* -----------------------------------------------------------
   * Manual submit
   * -----------------------------------------------------------*/
  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!manualTitle.trim() || !manualContent.trim()) return;

    await createArticleFromText({
      title: manualTitle.trim(),
      content: manualContent.trim(),
    });

    setManualTitle("");
    setManualContent("");
    setShowManualForm(false);
  }

  /* -----------------------------------------------------------
   * File upload submit
   * -----------------------------------------------------------*/
  async function handleFileSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    if (!file.type.startsWith("text/")) {
      alert("Only .txt files are supported for now.");
      return;
    }

    await createArticleFromFile({
      file,
      title: file.name,
    });

    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  /* -----------------------------------------------------------
   * Delete article
   * -----------------------------------------------------------*/
  async function handleDelete(article: KnowledgeArticle) {
    if (!confirm(`Delete article "${article.title}"?`)) return;
    await deleteArticle(article.id);
    setSelectedArticle(null);
  }

  /* -----------------------------------------------------------
   * UI
   * -----------------------------------------------------------*/
  return (
    <div className="flex h-full flex-col px-6 py-6 text-slate-900 dark:text-slate-200">

      {/* HEADER ROW --------------------------------------------------- */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Knowledge Base</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Your AI training library — manage articles, upload content, and organize knowledge.
          </p>
        </div>

        <AddNewArticleDropdown
          onManual={() => setShowManualForm(true)}
          onUrl={() => alert("URL ingestion coming soon")}
          onPdf={() => alert("PDF ingestion coming soon")}
        />
      </div>

      {/* SEARCH BAR --------------------------------------------------- */}
      <div className="mb-4 flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-800">
        <Search size={18} className="text-slate-500" />
        <input
          type="text"
          placeholder="Search articles..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            fetchArticles().catch(console.error);
          }}
          className="ml-2 w-full bg-transparent text-slate-900 placeholder:text-slate-400 outline-none dark:text-white"
        />
      </div>

      {/* MAIN SPLIT LAYOUT -------------------------------------------- */}
      <div className="flex h-full gap-4 overflow-hidden">

        {/* LEFT PANEL — LIST ---------------------------------------- */}
        <div className="w-[35%] overflow-y-auto rounded-xl border border-slate-300 bg-white p-4 dark:border-white/10 dark:bg-slate-900/60">
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
            <ul className="space-y-3">
              {articles.map((a) => {
                const isSelected = selectedArticle?.id === a.id;

                return (
                  <li
                    key={a.id}
                    className={`cursor-pointer rounded-md border px-3 py-2 text-sm transition ${
                      isSelected
                        ? "border-accent bg-accent/20 text-accent"
                        : "border-slate-300 bg-slate-50 hover:bg-slate-100 dark:border-white/10 dark:bg-slate-950 dark:hover:bg-slate-800"
                    }`}
                    onClick={() => setSelectedArticle(a)}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{a.title}</p>

                      <button
                        className="text-slate-400 hover:text-red-500"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(a);
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                      {a.content}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* RIGHT PANEL — EDITOR / VIEWER ----------------------------- */}
        <div className="flex flex-1 flex-col rounded-xl border border-slate-300 bg-white dark:border-white/10 dark:bg-slate-900/60 overflow-hidden">

          {/* If NO ARTICLE SELECTED */}
          {!selectedArticle && !showManualForm && (
            <div className="flex flex-1 items-center justify-center text-slate-500 dark:text-slate-400">
              Select an article or click **New** to add content.
            </div>
          )}

          {/* MANUAL CREATION FORM */}
          {showManualForm && (
            <div className="flex flex-col h-full overflow-hidden">

              <div className="sticky top-0 flex items-center justify-between border-b border-slate-300 bg-white px-6 py-4 dark:border-white/10 dark:bg-slate-900">
                <h2 className="text-lg font-semibold">New Article</h2>
                <button
                  onClick={() => setShowManualForm(false)}
                  className="text-slate-500 hover:text-slate-300"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4">
                <form onSubmit={handleManualSubmit} className="space-y-4 max-w-2xl">
                  <input
                    type="text"
                    placeholder="Article title"
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-800 dark:text-white"
                  />

                  <textarea
                    placeholder="Enter content..."
                    value={manualContent}
                    onChange={(e) => setManualContent(e.target.value)}
                    rows={12}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-800 dark:text-white"
                  />

                  <button
                    type="submit"
                    className="rounded-md bg-accent px-6 py-2 text-sm font-medium text-white"
                  >
                    Save Article
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* SELECTED ARTICLE VIEW */}
          {selectedArticle && !showManualForm && (
            <div className="flex flex-col h-full overflow-hidden">

              {/* Sticky Header */}
              <div className="sticky top-0 flex items-center justify-between border-b border-slate-300 bg-white px-6 py-4 dark:border-white/10 dark:bg-slate-900">
                <h2 className="text-lg font-semibold">{selectedArticle.title}</h2>
                <button
                  onClick={() => setSelectedArticle(null)}
                  className="text-slate-500 hover:text-slate-300"
                >
                  <X size={20} />
                </button>
              </div>

              {/* CONTENT */}
              <div className="flex-1 overflow-y-auto px-6 py-4 text-sm whitespace-pre-wrap dark:text-slate-200">
                {selectedArticle.content}
              </div>

              {/* META */}
              <div className="border-t border-slate-300 px-6 py-3 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
                ID: {selectedArticle.id} <br />
                Created:{" "}
                {new Date(selectedArticle.created_at).toLocaleString()}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ERROR MESSAGE */}
      {error && <p className="mt-4 text-sm text-red-500">Error: {error}</p>}
    </div>
  );
}