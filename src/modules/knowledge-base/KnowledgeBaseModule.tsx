import { useEffect, useState } from 'react';
import { FilePlus2, FileText, Loader2, Upload } from 'lucide-react';
import { useKnowledgeBaseStore } from '../../state/useKnowledgeBaseStore';
import { useOrganizationStore } from '../../state/useOrganizationStore';

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
  const [selectedArticle, setSelectedArticle] = useState<string | null>(null);
  const [editor, setEditor] = useState({ title: '', description: '', content: '' });
  const [isEmbedding, setIsEmbedding] = useState(false);

  useEffect(() => {
    if (currentOrganization) {
      fetchArticles(currentOrganization.id).catch(console.error);
      fetchUnanswered(currentOrganization.id).catch(console.error);
    }
  }, [currentOrganization, fetchArticles, fetchUnanswered]);

  useEffect(() => {
    if (selectedArticle && !chunks[selectedArticle]) {
      fetchChunks(selectedArticle).catch(console.error);
    }
  }, [selectedArticle, chunks, fetchChunks]);

  const handleSelectArticle = (articleId: string) => {
    setSelectedArticle(articleId);
    const article = articles.find((item) => item.id === articleId);
    if (article) {
      setEditor({ title: article.title, description: article.description ?? '', content: article.content });
    }
  };

  const handleSave = async () => {
    if (!currentOrganization) return;
    await saveArticle({
      id: selectedArticle ?? undefined,
      organization_id: currentOrganization.id,
      title: editor.title,
      description: editor.description,
      content: editor.content
    });
  };

  const triggerEmbedding = async () => {
    if (!selectedArticle || !currentOrganization) return;
    setIsEmbedding(true);
    try {
      const response = await fetch('/functions/v1/embed-article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_id: selectedArticle, organization_id: currentOrganization.id })
      });
      if (!response.ok) throw new Error('Failed to trigger embedding');
      await fetchChunks(selectedArticle);
    } finally {
      setIsEmbedding(false);
    }
  };

  return (
    <div className="grid h-full grid-cols-[280px,1fr,320px] gap-6">
      <div className="flex flex-col rounded-2xl border border-white/5 bg-slate-900/60">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Articles</h2>
          <button
            onClick={() => {
              setSelectedArticle(null);
              setEditor({ title: '', description: '', content: '' });
            }}
            className="flex items-center gap-2 rounded-md border border-white/10 px-3 py-1 text-xs text-slate-200 hover:border-accent hover:text-white"
          >
            <FilePlus2 size={14} />
            New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && <div className="p-4 text-xs text-slate-400">Loading articles...</div>}
          {articles.map((article) => (
            <button
              key={article.id}
              onClick={() => handleSelectArticle(article.id)}
              className={`flex w-full flex-col gap-1 border-b border-white/5 px-4 py-3 text-left transition hover:bg-white/5 ${
                selectedArticle === article.id ? 'bg-accent/10' : ''
              }`}
            >
              <span className="text-sm font-medium text-white">{article.title}</span>
              <span className="text-xs text-slate-400">Updated {new Date(article.updated_at).toLocaleDateString()}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col rounded-2xl border border-white/5 bg-slate-900/60">
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">{selectedArticle ? 'Edit Article' : 'New Article'}</h2>
            <p className="text-xs text-slate-400">Maintain knowledge base content and trigger embeddings.</p>
          </div>
          <button
            onClick={handleSave}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/80"
          >
            Save
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">Title</label>
            <input
              value={editor.title}
              onChange={(event) => setEditor((prev) => ({ ...prev, title: event.target.value }))}
              className="mt-1 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">Description</label>
            <textarea
              value={editor.description}
              onChange={(event) => setEditor((prev) => ({ ...prev, description: event.target.value }))}
              className="mt-1 h-20 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">Content</label>
            <textarea
              value={editor.content}
              onChange={(event) => setEditor((prev) => ({ ...prev, content: event.target.value }))}
              className="mt-1 h-64 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
            />
          </div>
          {selectedArticle && (
            <button
              onClick={triggerEmbedding}
              disabled={isEmbedding}
              className="flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-xs text-slate-200 transition hover:border-accent hover:text-white disabled:opacity-50"
            >
              {isEmbedding ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
              Trigger Embedding
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-white/5 bg-slate-900/60">
          <div className="border-b border-white/5 px-5 py-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Embedding Quality</h3>
          </div>
          <div className="space-y-3 px-5 py-4 text-sm text-slate-300">
            <div className="flex items-center justify-between">
              <span>Embedded Chunks</span>
              <span className="text-lg font-semibold text-white">{selectedArticle ? chunks[selectedArticle]?.length ?? 0 : 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Success Rate</span>
              <span className="rounded-full bg-success/20 px-3 py-1 text-xs font-semibold text-success">98%</span>
            </div>
          </div>
        </div>

        <div className="flex-1 rounded-2xl border border-white/5 bg-slate-900/60">
          <div className="border-b border-white/5 px-5 py-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Unanswered Questions</h3>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4 text-sm">
            {unanswered.map((item) => (
              <div key={item.id} className="rounded-xl border border-white/10 bg-slate-900/80 p-3">
                <div className="text-sm text-white">{item.question}</div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                  <span>{item.occurrences} occurrences</span>
                  <div className="flex gap-2">
                    <button
                      className="rounded-md border border-white/10 px-2 py-1 text-[11px] uppercase tracking-wide text-slate-200 hover:border-accent hover:text-white"
                      onClick={() => markUnansweredIrrelevant(item.id).catch(console.error)}
                    >
                      Mark Irrelevant
                    </button>
                    <button
                      className="rounded-md border border-white/10 px-2 py-1 text-[11px] uppercase tracking-wide text-accent hover:border-accent hover:text-white"
                      onClick={() => {
                        setEditor((prev) => ({ ...prev, content: `${prev.content}\n\nQ: ${item.question}\nA: ` }));
                        setSelectedArticle(null);
                      }}
                    >
                      Add to KB
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {!unanswered.length && <p className="text-xs text-slate-400">No unanswered questions! 🎉</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
