import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";
import { useOrganizationStore } from "./useOrganizationStore";
import type { KnowledgeArticle } from "../types/database";

/* -----------------------------------------------------------
   CONSTANTS
----------------------------------------------------------- */
const ALLOWED_FILE_TYPES = [
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
];

/* -----------------------------------------------------------
   TYPES
----------------------------------------------------------- */
type ArticleStatus = "draft" | "published" | "archived";

type KnowledgeBaseState = {
  articles: KnowledgeArticle[];
  loading: boolean;
  uploading: boolean;
  error: string | null;
  selectedArticle: KnowledgeArticle | null;
  searchTerm: string;

  fetchArticles: () => Promise<void>;

  createArticleFromText: (params: {
    title: string;
    content: string;
    keywords?: string[];
    status?: ArticleStatus;
  }) => Promise<void>;

  createArticleFromFile: (params: {
    file: File;
    title?: string;
    keywords?: string[];
    status?: ArticleStatus;
  }) => Promise<void>;

  replaceFileForArticle: (params: {
    article: KnowledgeArticle;
    file: File;
    keywords?: string[];
  }) => Promise<void>;

  downloadOriginalFile: (article: KnowledgeArticle) => Promise<void>;

  updateArticle: (params: {
    id: string;
    title?: string;
    content?: string;
    keywords?: string[];
    status?: ArticleStatus;
    published_at?: string | null;
  }) => Promise<void>;

  deleteArticle: (articleId: string) => Promise<void>;

  setSelectedArticle: (article: KnowledgeArticle | null) => void;
  setSearchTerm: (term: string) => void;
};

/* -----------------------------------------------------------
   STORE
----------------------------------------------------------- */
export const useKnowledgeBaseStore = create<KnowledgeBaseState>((set, get) => ({
  articles: [],
  loading: false,
  uploading: false,
  error: null,
  selectedArticle: null,
  searchTerm: "",

  setSelectedArticle: (article) => set({ selectedArticle: article }),
  setSearchTerm: (term) => set({ searchTerm: term }),

  /* -----------------------------------------------------------
     FETCH ARTICLES (ORG ONLY)
  ----------------------------------------------------------- */
  fetchArticles: async () => {
    const { activeOrganization } = useOrganizationStore.getState();
    const { searchTerm } = get();

    if (!activeOrganization) {
      set({ articles: [], error: null });
      return;
    }

    set({ loading: true, error: null });

    try {
      const { data, error } = await supabase
        .from("knowledge_articles")
        .select("*")
        .eq("organization_id", activeOrganization.id)
        .order("updated_at", { ascending: false });

      if (error) throw error;

      let articles = (data ?? []) as KnowledgeArticle[];

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        articles = articles.filter(
          (a) =>
            a.title?.toLowerCase().includes(term) ||
            a.content?.toLowerCase().includes(term) ||
            (Array.isArray(a.keywords) &&
              a.keywords.some((k) => k.toLowerCase().includes(term)))
        );
      }

      set({ articles, loading: false });
    } catch (err: any) {
      set({
        loading: false,
        error: err?.message ?? "Failed to load knowledge base",
      });
    }
  },

  /* -----------------------------------------------------------
     CREATE FROM TEXT
  ----------------------------------------------------------- */
  createArticleFromText: async ({ title, content, keywords, status }) => {
    const { activeOrganization } = useOrganizationStore.getState();
    if (!activeOrganization) return;

    set({ uploading: true, error: null });

    try {
      const { error } = await supabase.functions.invoke("ai-generate-kb", {
        body: {
          organization_id: activeOrganization.id,
          source_type: "text",
          title,
          content,
          status: status ?? "draft",
          keywords: Array.isArray(keywords) ? keywords : [],
        },
      });

      if (error) throw error;

      await get().fetchArticles();
      set({ uploading: false });
    } catch (err: any) {
      set({
        uploading: false,
        error: err?.message ?? "Failed to create article",
      });
    }
  },

  /* -----------------------------------------------------------
     CREATE FROM FILE
  ----------------------------------------------------------- */
  createArticleFromFile: async ({ file, title, keywords, status }) => {
    const { activeOrganization } = useOrganizationStore.getState();
    if (!activeOrganization) return;

    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      set({ error: "Unsupported file type" });
      return;
    }

    set({ uploading: true, error: null });

    try {
      const bucket = "knowledge-base";
      const safeName = file.name.replace(/\s+/g, "_");
      const path = `kb/${activeOrganization.id}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { error: invokeError } = await supabase.functions.invoke(
        "ai-generate-kb",
        {
          body: {
            organization_id: activeOrganization.id,
            source_type: "file",
            title: title || file.name,
            status: status ?? "draft",
            file_bucket: bucket,
            file_path: path,
            mime_type: file.type,
            original_filename: file.name,
            keywords: Array.isArray(keywords) ? keywords : [],
          },
        }
      );

      if (invokeError) throw invokeError;

      await get().fetchArticles();
      set({ uploading: false });
    } catch (err: any) {
      set({
        uploading: false,
        error: err?.message ?? "Failed to upload file",
      });
    }
  },

  /* -----------------------------------------------------------
     REPLACE FILE FOR ARTICLE
  ----------------------------------------------------------- */
  replaceFileForArticle: async ({ article, file, keywords }) => {
    const { activeOrganization } = useOrganizationStore.getState();
    if (!activeOrganization || article.source_type !== "file") return;

    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      set({ error: "Unsupported file type" });
      return;
    }

    set({ uploading: true, error: null });

    try {
      const bucket = "knowledge-base";
      const safeName = file.name.replace(/\s+/g, "_");
      const path = `kb/${activeOrganization.id}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { error: invokeError } = await supabase.functions.invoke(
        "ai-generate-kb",
        {
          body: {
            organization_id: activeOrganization.id,
            article_id: article.id,
            source_type: "file",
            title: article.title,
            file_bucket: bucket,
            file_path: path,
            mime_type: file.type,
            original_filename: file.name,
            keywords: Array.isArray(keywords)
              ? keywords
              : article.keywords ?? [],
          },
        }
      );

      if (invokeError) throw invokeError;

      await get().fetchArticles();
      set({ uploading: false });
    } catch (err: any) {
      set({
        uploading: false,
        error: err?.message ?? "Failed to replace file",
      });
    }
  },

  /* -----------------------------------------------------------
     DOWNLOAD ORIGINAL FILE
  ----------------------------------------------------------- */
  downloadOriginalFile: async (article) => {
    if (!article.file_bucket || !article.file_path) {
      set({ error: "File not available" });
      return;
    }

    try {
      const { data, error } = await supabase.storage
        .from(article.file_bucket)
        .createSignedUrl(article.file_path, 60);

      if (error || !data?.signedUrl) throw error;

      window.open(data.signedUrl, "_blank");
    } catch (err: any) {
      set({
        error: err?.message ?? "Failed to download file",
      });
    }
  },

  /* -----------------------------------------------------------
     UPDATE ARTICLE
  ----------------------------------------------------------- */
  updateArticle: async ({
    id,
    title,
    content,
    keywords,
    status,
    published_at,
  }) => {
    const { activeOrganization } = useOrganizationStore.getState();
    if (!activeOrganization) return;

    set({ loading: true, error: null });

    try {
      const payload: any = {};
      if (title !== undefined) payload.title = title;
      if (content !== undefined) payload.content = content;
      if (Array.isArray(keywords)) payload.keywords = keywords;
      if (status) payload.status = status;
      if (published_at !== undefined) payload.published_at = published_at;

      const { error } = await supabase
        .from("knowledge_articles")
        .update(payload)
        .eq("id", id)
        .eq("organization_id", activeOrganization.id);

      if (error) throw error;

      await get().fetchArticles();
      set({ loading: false });
    } catch (err: any) {
      set({
        loading: false,
        error: err?.message ?? "Failed to update article",
      });
    }
  },

  /* -----------------------------------------------------------
     DELETE ARTICLE
  ----------------------------------------------------------- */
  deleteArticle: async (articleId) => {
    const { activeOrganization } = useOrganizationStore.getState();
    if (!activeOrganization) return;

    set({ loading: true, error: null });

    try {
      const { error } = await supabase
        .from("knowledge_articles")
        .delete()
        .eq("id", articleId)
        .eq("organization_id", activeOrganization.id);

      if (error) throw error;

      await get().fetchArticles();
      set({ loading: false, selectedArticle: null });
    } catch (err: any) {
      set({
        loading: false,
        error: err?.message ?? "Failed to delete article",
      });
    }
  },
}));
