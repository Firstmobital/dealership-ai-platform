import { create } from 'zustand';
import { supabase } from '../lib/supabaseClient';
import type {
  KnowledgeArticle,
  KnowledgeChunk,
  UnansweredQuestion
} from '../types/database';

type KnowledgeBaseState = {
  articles: KnowledgeArticle[];
  chunks: Record<string, KnowledgeChunk[]>;
  unanswered: UnansweredQuestion[];
  loading: boolean;

  fetchArticles: (organizationId: string) => Promise<void>;
  fetchChunks: (articleId: string) => Promise<void>;
  fetchUnanswered: (organizationId: string) => Promise<void>;

  /**
   * Create or update an article.
   * Returns the saved article so the caller knows the final id.
   */
  saveArticle: (payload: Partial<KnowledgeArticle>) => Promise<KnowledgeArticle>;

  markUnansweredIrrelevant: (id: string) => Promise<void>;
};

export const useKnowledgeBaseStore = create<KnowledgeBaseState>((set, get) => ({
  articles: [],
  chunks: {},
  unanswered: [],
  loading: false,

  // Load all articles for the current organization
  fetchArticles: async (organizationId: string) => {
    set({ loading: true });
    const { data, error } = await supabase
      .from('knowledge_articles')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    set({
      articles: data ?? [],
      loading: false
    });
  },

  // Load chunks for a specific article
  fetchChunks: async (articleId: string) => {
    const { data, error } = await supabase
      .from('knowledge_chunks')
      .select('*')
      .eq('article_id', articleId);

    if (error) throw error;

    set((state) => ({
      chunks: {
        ...state.chunks,
        [articleId]: data ?? []
      }
    }));
  },

  // Load unanswered questions (for training the KB)
  fetchUnanswered: async (organizationId: string) => {
    const { data, error } = await supabase
      .from('unanswered_questions')
      .select('*')
      .eq('organization_id', organizationId)
      .order('occurrences', { ascending: false });

    if (error) throw error;

    set({
      unanswered: data ?? []
    });
  },

  // Create or update a KB article
  saveArticle: async (payload) => {
    const { id, ...rest } = payload;

    let saved: KnowledgeArticle | null = null;

    if (id) {
      const { data, error } = await supabase
        .from('knowledge_articles')
        .update(rest)
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      saved = data;
    } else {
      const { data, error } = await supabase
        .from('knowledge_articles')
        .insert(rest)
        .select('*')
        .single();

      if (error) throw error;
      saved = data;
    }

    if (saved?.organization_id) {
      await get().fetchArticles(saved.organization_id);
    }

    return saved!;
  },

  // Remove an unanswered question once handled / ignored
  markUnansweredIrrelevant: async (id) => {
    const { error } = await supabase
      .from('unanswered_questions')
      .delete()
      .eq('id', id);

    if (error) throw error;

    set((state) => ({
      unanswered: state.unanswered.filter((item) => item.id !== id)
    }));
  }
}));
