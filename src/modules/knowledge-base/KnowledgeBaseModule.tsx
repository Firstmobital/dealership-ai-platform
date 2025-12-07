// src/modules/knowledge-base/KnowledgeBaseModule.tsx

import { useEffect, useRef, useState } from "react";
import {
  FileUp,
  FileText,
  Loader2,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import { useKnowledgeBaseStore } from "../../state/useKnowledgeBaseStore";
import { useOrganizationStore } from "../../state/useOrganizationStore";
import { useSubOrganizationStore } from "../../state/useSubOrganizationStore";
import type { KnowledgeArticle } from "../../types/database";

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

  const [textTitle, setTextTitle] = useState("");
  const [textContent, setTextContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load KB when org or sub-org changes
  useEffect(() => {
    if (!currentOrganization) return;
    fetchArticles().catch(console.error);
    setSelectedArticle(null);
  }, [currentOrganization?.id, activeSubOrg?.id]);

  // TEXT SUBMIT
  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textTitle.trim() || !textContent.trim()) return;

    await createArticleFromText({
      title: textTitle.trim(),
      content: textContent.trim(),
    });

    setTextTitle("");
    setTextContent("");
  };

  // FILE SUBMIT
  const handleFileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    // 🔹 FRONT-END VALIDATION: Only allow .txt
    if (!file.type.startsWith("text/")) {
      alert("Only .txt files are supported right now. Please convert your PDF/DOCX to .txt and upload again.");
      return;
    }

    await createArticleFromFile({
      file,
      title: file.name,
    });

    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // DELETE
  const handleDelete = async (article: KnowledgeArticle) => {
    if (!window.confirm(`Delete KB article "${article.title}"?`)) return;
    await deleteArticle(article.id);
    setSelectedArticle(null);
  };

  return (
    <div className="flex h-full flex-col px-6 py-6 text-slate-200">

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Knowledge Base</h1>
          <p className="text-sm text-slate-400">
            AI reference library. Upload text or files to train the AI.
          </p>
        </div>
      </div>

      {/* Search + Upload */}
      <div className="mb-6 flex gap-4">
        
        {/* Search */}
        <div className="flex w-1/2 items-center rounded-md border border-slate-700 bg-slate-900 px-3">
          <Search size={18} className="text-slate-500" />
          <input
            type="text"
            placeholder="Search knowledge..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyUp={() => fetchArticles().catch(console.error)}
            className="ml-2 w-full bg-transparent py-2 text-sm text-white outline-none"
          />
        </div>

        {/* File Upload */}
        <form onSubmit={handleFileSubmit} className="flex gap-2">
          <input
            type="file"
            // 🔹 NOW ONLY TEXT FILES
            accept=".txt"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            ref={fileInputRef}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
          />

          <button
            type="submit"
            disabled={uploading || !file}
            className="flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {uploading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <FileUp size={16} />
            )}
            Upload
          </button>
        </form>
      </div>

      {/* TEXT INGESTION */}
      <div className="mb-6 rounded-xl border border-slate-700 bg-slate-900 p-4">
        <h2 className="mb-3 text-sm font-semibold text-white">Add Knowledge from Text</h2>

        <form onSubmit={handleTextSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="Article title"
            value={textTitle}
            onChange={(e) => setTextTitle(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />

          <textarea
            placeholder="Paste text content here..."
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            rows={4}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />

          <button
            type="submit"
            disabled={uploading}
            className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {uploading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <FileText size={16} />
            )}
            Ingest Text
          </button>
        </form>
      </div>

      {/* LAYOUT */}
      <div className="flex flex-1 gap-6 overflow-hidden">

        {/* LEFT PANE: Articles */}
        <div className="w-1/3 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-4">
          <h2 className="mb-3 text-sm font-semibold text-white">
            Articles ({articles.length})
          </h2>

          {loading ? (
            <div className="flex items-center gap-2 py-6 text-slate-400">
              <Loader2 className="animate-spin" size={16} /> Loading...
            </div>
          ) : articles.length === 0 ? (
            <p className="py-6 text-sm text-slate-500">No knowledge articles yet.</p>
          ) : (
            <ul className="space-y-3">
              {articles.map((article) => {
                const isSelected = selectedArticle?.id === article.id;

                return (
                  <li
                    key={article.id}
                    className={`cursor-pointer rounded-md border px-3 py-2 text-sm transition ${
                      isSelected
                        ? "border-accent bg-accent/20 text-accent"
                        : "border-slate-700 bg-slate-950 hover:bg-slate-800"
                    }`}
                    onClick={() => setSelectedArticle(article)}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{article.title}</p>

                      <button
                        className="text-slate-400 hover:text-red-400"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(article);
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <p className="mt-1 line-clamp-2 text-xs text-slate-400">
                      {article.content}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* RIGHT PANE: Preview */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 p-4">
          {!selectedArticle ? (
            <div className="flex flex-1 items-center justify-center text-slate-500">
              Select an article to view its summary.
            </div>
          ) : (
            <div className="flex flex-col overflow-y-auto">
              <div className="flex items-start justify-between">
                <h2 className="text-lg font-semibold text-white">
                  {selectedArticle.title}
                </h2>

                <button
                  onClick={() => setSelectedArticle(null)}
                  className="text-slate-400 hover:text-slate-200"
                >
                  <XCircle size={20} />
                </button>
              </div>

              <div className="mt-4 text-sm text-slate-300 whitespace-pre-wrap">
                {selectedArticle.content || "No summary available."}
              </div>

              <p className="mt-6 text-xs text-slate-500">
                ID: {selectedArticle.id}
              </p>
              <p className="text-xs text-slate-500">
                Created: {new Date(selectedArticle.created_at).toLocaleString()}
              </p>
            </div>
          )}
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-red-400">Error: {error}</p>}
    </div>
  );
}

