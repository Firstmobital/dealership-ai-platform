import { create } from 'zustand';
import { supabase } from '../lib/supabaseClient';
import type { KnowledgeArticle, KnowledgeChunk, UnansweredQuestion } from '../types/database';

type KnowledgeBaseState = {
  articles: KnowledgeArticle[];
  chunks: Record<string, KnowledgeChunk[]>;
  unanswered: UnansweredQuestion[];
  loading: boolean;
  fetchArticles: (organizationId: string) => Promise<void>;
  fetchChunks: (articleId: string) => Promise<void>;
  fetchUnanswered: (organizationId: string) => Promise<void>;
  saveArticle: (payload: Partial<KnowledgeArticle>) => Promise<void>;
  markUnansweredIrrelevant: (id: string) => Promise<void>;
};

export const useKnowledgeBaseStore = create<KnowledgeBaseState>((set, get) => ({
  articles: [],
  chunks: {},
  unanswered: [],
  loading: false,
  fetchArticles: async (organizationId) => {
    set({ loading: true });
    const { data, error } = await supabase
      .from('knowledge_articles')
      .select('*')
      .eq('organization_id', organizationId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    set({ articles: data ?? [], loading: false });
  },
  fetchChunks: async (articleId) => {
    const { data, error } = await supabase
      .from('knowledge_chunks')
      .select('*')
      .eq('article_id', articleId)
      .order('id', { ascending: true });
    if (error) throw error;
    set((state) => ({ chunks: { ...state.chunks, [articleId]: data ?? [] } }));
  },
  fetchUnanswered: async (organizationId) => {
    const { data, error } = await supabase
      .from('unanswered_questions')
      .select('*')
      .eq('organization_id', organizationId)
      .order('occurrences', { ascending: false });
    if (error) throw error;
    set({ unanswered: data ?? [] });
  },
  saveArticle: async (payload) => {
    const { id, ...rest } = payload;
    if (id) {
      const { error } = await supabase.from('knowledge_articles').update(rest).eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('knowledge_articles').insert(rest);
      if (error) throw error;
    }
    if (payload.organization_id) {
      await get().fetchArticles(payload.organization_id);
    }
  },
  markUnansweredIrrelevant: async (id) => {
    const { error } = await supabase.from('unanswered_questions').delete().eq('id', id);
    if (error) throw error;
    set((state) => ({ unanswered: state.unanswered.filter((item) => item.id !== id) }));
  }
}));
