import { useEffect, useState } from 'react';
import { FilePlus2, FileText, Loader2, Upload } from 'lucide-react';
import { useKnowledgeBaseStore } from '../../state/useKnowledgeBaseStore';
import { useOrganizationStore } from '../../state/useOrganizationStore';
import { useSubOrganizationStore } from '../../state/useSubOrganizationStore';
import { supabase } from '../../lib/supabaseClient';

type EditorState = {
  title: string;
  description: string;
  content: string;
};

export function KnowledgeBaseModule() {
  const {
    articles,
    chunks,
    unanswered,
    loading,
    fetchArticles,
    fetchChunks,
    fetchUnanswered,
    saveArticle,
    markUnansweredIrrelevant
  } = useKnowledgeBaseStore();

  const { currentOrganization } = useOrganizationStore();
  const { activeSubOrg } = useSubOrganizationStore();

  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>({
    title: '',
    description: '',
    content: ''
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isEmbedding, setIsEmbedding] = useState(false);
  const [embedStatus, setEmbedStatus] = useState<string | null>(null);

  // Load org + sub-org specific data
  useEffect(() => {
    if (!currentOrganization) return;
    void fetchArticles(currentOrganization.id);
    void fetchUnanswered(currentOrganization.id);
  }, [currentOrganization, activeSubOrg?.id, fetchArticles, fetchUnanswered]);

  // Whenever we change article selection, hydrate the editor + chunks
  useEffect(() => {
    if (!selectedArticleId) {
      setEditor({
        title: '',
        description: '',
        content: ''
      });
      return;
    }

    const article = articles.find((a) => a.id === selectedArticleId);
    if (article) {
      setEditor({
        title: article.title,
        description: article.description ?? '',
        content: article.content
      });
      void fetchChunks(article.id);
    }
  }, [selectedArticleId, articles, fetchChunks]);

  const currentChunks = selectedArticleId
    ? chunks[selectedArticleId] ?? []
    : [];

  const handleNewArticle = () => {
    setSelectedArticleId(null);
    setEmbedStatus(null);
    setEditor({
      title: '',
      description: '',
      content: ''
    });
  };

  const handleSave = async () => {
    if (!currentOrganization) return;
    if (!editor.title.trim() || !editor.content.trim()) {
      alert('Title and content are required.');
      return;
    }

    setIsSaving(true);
    setEmbedStatus(null);

    try {
      const saved = await saveArticle({
        id: selectedArticleId ?? undefined,
        organization_id: currentOrganization.id,
        sub_organization_id: activeSubOrg?.id ?? null, // 👈 key change
        title: editor.title.trim(),
        description: editor.description.trim() || null,
        content: editor.content.trim()
      });

      setSelectedArticleId(saved.id);
    } catch (error) {
      console.error('Failed to save article:', error);
      alert('Failed to save article. Check console for details.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEmbed = async () => {
    if (!selectedArticleId) {
      alert('Select or save an article first.');
      return;
    }

    setIsEmbedding(true);
    setEmbedStatus(null);

    try {
      const { data, error } = await supabase.functions.invoke('embed-article', {
        body: { article_id: selectedArticleId }
      });

      if (error) {
        console.error('Embed error:', error);
        setEmbedStatus('❌ Failed to generate embeddings.');
      } else {
        const count = (data as any)?.chunks ?? 0;
        setEmbedStatus(`✅ Generated ${count} embeddings for this article.`);
        await fetchChunks(selectedArticleId);
      }
    } catch (err) {
      console.error('Embed exception:', err);
      setEmbedStatus('❌ Error while calling embed-article.');
    } finally {
      setIsEmbedding(false);
    }
  };

  const handleAddUnansweredToKb = async (id: string, question: string) => {
    // Prefill editor so you can turn this into an article
    setSelectedArticleId(null);
    setEditor({
      title: question.slice(0, 80),
      description: 'Auto-created from an unanswered customer question.',
      content: question
    });

    // Optionally remove it from unanswered list
    try {
      await markUnansweredIrrelevant(id);
    } catch (error) {
      console.error('Failed to remove unanswered question:', error);
    }
  };

  return (
    <div className="grid h-full grid-cols-[280px,1.6fr,1.1fr] gap-6">
      {/* LEFT: Articles list */}
      <div className="flex h-full flex-col rounded-2xl border border-white/5 bg-slate-900/60">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
            <FileText size={16} />
            Knowledge Articles
          </div>
          <button
            type="button"
            onClick={handleNewArticle}
            className="inline-flex items-center gap-1 rounded-full bg-accent/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white hover:bg-accent"
          >
            <FilePlus2 size={14} />
            New
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center gap-2 p-4 text-xs text-slate-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading articles...
            </div>
          )}

          {articles.map((article) => {
            const isActive = selectedArticleId === article.id;
            return (
              <button
                key={article.id}
                type="button"
                onClick={() => {
                  setEmbedStatus(null);
                  setSelectedArticleId(article.id);
                }}
                className={`flex w-full flex-col gap-1 border-b border-white/5 px-4 py-3 text-left text-xs transition hover:bg-white/5 ${
                  isActive ? 'bg-accent/10' : ''
                }`}
              >
                <span className="text-sm font-medium text-white line-clamp-1">
                  {article.title}
                </span>
                {article.description && (
                  <span className="text-[11px] text-slate-400 line-clamp-2">
                    {article.description}
                  </span>
                )}
              </button>
            );
          })}

          {!loading && !articles.length && (
            <div className="p-4 text-xs text-slate-400">
              No articles yet. Create your first knowledge article on the right.
            </div>
          )}
        </div>
      </div>

      {/* MIDDLE: Editor */}
      <div className="flex h-full flex-col rounded-2xl border border-white/5 bg-slate-900/60">
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-3">
          <div>
            <h2 className="text-sm font-semibold text-white">
              {selectedArticleId ? 'Edit Article' : 'New Article'}
            </h2>
            <p className="text-[11px] text-slate-400">
              Write structured dealership knowledge for the AI to use.
            </p>
          </div>
          <button
            type="button"
            className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-200"
          >
            <Upload size={14} />
            Import (Coming Soon)
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4 text-sm">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Title
            </label>
            <input
              type="text"
              className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-accent"
              value={editor.title}
              onChange={(e) =>
                setEditor((prev) => ({ ...prev, title: e.target.value }))
              }
              placeholder="e.g. Altroz XZ+ CNG Offer & Pricing Guide"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Short Description
            </label>
            <input
              type="text"
              className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-accent"
              value={editor.description}
              onChange={(e) =>
                setEditor((prev) => ({
                  ...prev,
                  description: e.target.value
                }))
              }
              placeholder="Optional summary for this article"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Content
            </label>
            <textarea
              className="h-64 w-full resize-none rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-accent"
              value={editor.content}
              onChange={(e) =>
                setEditor((prev) => ({ ...prev, content: e.target.value }))
              }
              placeholder={`Paste your Altroz / showroom knowledge here.\n\nUse clear bullet points, variants, prices, offers, finance schemes, etc.\nThe AI will use embeddings over this content.`}
            />
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-white/5 px-6 py-3">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            {embedStatus && <span>{embedStatus}</span>}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-full border border-accent/60 bg-accent/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent hover:bg-accent/20 disabled:opacity-60"
            >
              {isSaving ? 'Saving…' : 'Save Article'}
            </button>
            <button
              type="button"
              onClick={handleEmbed}
              disabled={isEmbedding || !selectedArticleId}
              className="rounded-full bg-accent px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white hover:bg-accent/80 disabled:opacity-60"
            >
              {isEmbedding ? 'Embedding…' : 'Generate Embeddings'}
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT: Chunks + Unanswered */}
      <div className="flex h-full flex-col gap-4">
        <div className="flex flex-1 flex-col rounded-2xl border border-white/5 bg-slate-900/60">
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
              <FileText size={16} />
              Generated Chunks
            </div>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3 text-[11px] text-slate-200">
            {!selectedArticleId && (
              <p className="text-slate-500">
                Save & embed an article to see its chunks here.
              </p>
            )}
            {selectedArticleId && !currentChunks.length && (
              <p className="text-slate-500">
                No chunks yet. Click &quot;Generate Embeddings&quot; after saving.
              </p>
            )}
            {currentChunks.map((chunk) => (
              <div
                key={chunk.id}
                className="rounded-xl border border-white/10 bg-slate-950/60 p-2"
              >
                <p className="whitespace-pre-wrap leading-snug">{chunk.chunk}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-1 flex-col rounded-2xl border border-white/5 bg-slate-900/60">
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
              Unanswered Questions
            </div>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3 text-[11px] text-slate-200">
            {!unanswered.length && (
              <p className="text-slate-500">
                No unanswered questions yet. Once customers ask things the bot
                cannot answer, they will appear here.
              </p>
            )}

            {unanswered.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-white/10 bg-slate-950/60 p-2"
              >
                <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">
                  {item.occurrences}x asked
                </div>
                <p className="mb-2 whitespace-pre-wrap text-[11px] leading-snug">
                  {item.question}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleAddUnansweredToKb(item.id, item.question)
                    }
                    className="rounded-full bg-accent px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-white hover:bg-accent/80"
                  >
                    Add to KB
                  </button>
                  <button
                    type="button"
                    onClick={() => markUnansweredIrrelevant(item.id)}
                    className="rounded-full border border-white/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-300 hover:bg-white/5"
                  >
                    Ignore
                  </button>
                </div>
              </div>
            ))}

            {!unanswered.length && (
              <p className="mt-1 text-[10px] text-slate-500">
                Train your AI by turning common questions into KB articles.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
