import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";
import { useOrganizationStore } from "./useOrganizationStore";
import { useSubOrganizationStore } from "./useSubOrganizationStore";
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
  }) => Promise<void>;

  createArticleFromFile: (params: {
    file: File;
    title?: string;
    keywords?: string[];
  }) => Promise<void>;

  replaceFileForArticle: (params: {
    article: KnowledgeArticle;
    file: File;
    keywords?: string[];
  }) => Promise<void>;

  downloadOriginalFile: (article: KnowledgeArticle) => Promise<void>;

  updateArticle: (params: {
    id: string;
    title: string;
    content: string;
    keywords?: string[];
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
     FETCH ARTICLES
  ----------------------------------------------------------- */
  fetchArticles: async () => {
    const { currentOrganization } = useOrganizationStore.getState();
    const { activeSubOrg } = useSubOrganizationStore.getState();
    const { searchTerm } = get();

    if (!currentOrganization) {
      set({ articles: [], error: null });
      return;
    }

    set({ loading: true, error: null });

    try {
      let query = supabase
        .from("knowledge_articles")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .order("created_at", { ascending: false });

      if (activeSubOrg) {
        query = query.or(
          `sub_organization_id.eq.${activeSubOrg.id},sub_organization_id.is.null`
        );
      }

      const { data, error } = await query;
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
  createArticleFromText: async ({ title, content, keywords }) => {
    const { currentOrganization } = useOrganizationStore.getState();
    const { activeSubOrg } = useSubOrganizationStore.getState();

    if (!currentOrganization) return;

    set({ uploading: true, error: null });

    try {
      const { error } = await supabase.functions.invoke("ai-generate-kb", {
        body: {
          organization_id: currentOrganization.id,
          sub_organization_id: activeSubOrg?.id ?? null,
          source_type: "text",
          title,
          content,
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
  createArticleFromFile: async ({ file, title, keywords }) => {
    const { currentOrganization } = useOrganizationStore.getState();
    const { activeSubOrg } = useSubOrganizationStore.getState();

    if (!currentOrganization) return;

    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      set({ error: "Unsupported file type" });
      return;
    }

    set({ uploading: true, error: null });

    try {
      const bucket = "knowledge-base";
      const safeName = file.name.replace(/\s+/g, "_");
      const path = `kb/${currentOrganization.id}/${Date.now()}-${safeName}`;

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
            organization_id: currentOrganization.id,
            sub_organization_id: activeSubOrg?.id ?? null,
            source_type: "file",
            title: title || file.name,
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
    const { currentOrganization } = useOrganizationStore.getState();

    if (!currentOrganization || article.source_type !== "file") return;

    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      set({ error: "Unsupported file type" });
      return;
    }

    set({ uploading: true, error: null });

    try {
      const bucket = "knowledge-base";
      const safeName = file.name.replace(/\s+/g, "_");
      const path = `kb/${currentOrganization.id}/${Date.now()}-${safeName}`;

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
            organization_id: currentOrganization.id,
            article_id: article.id, // replace mode
            source_type: "file",
            title: article.title,
            file_bucket: bucket,
            file_path: path,
            mime_type: file.type,
            original_filename: file.name,
            keywords: Array.isArray(keywords) ? keywords : article.keywords ?? [],
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
     UPDATE TEXT ARTICLE (keywords supported)
  ----------------------------------------------------------- */
  updateArticle: async ({ id, title, content, keywords }) => {
    const { currentOrganization } = useOrganizationStore.getState();
    if (!currentOrganization) return;

    set({ loading: true, error: null });

    try {
      const payload: any = { title, content };
      if (Array.isArray(keywords)) payload.keywords = keywords;

      const { error } = await supabase
        .from("knowledge_articles")
        .update(payload)
        .eq("id", id)
        .eq("organization_id", currentOrganization.id);

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
    const { currentOrganization } = useOrganizationStore.getState();
    if (!currentOrganization) return;

    set({ loading: true, error: null });

    try {
      const { error } = await supabase
        .from("knowledge_articles")
        .delete()
        .eq("id", articleId)
        .eq("organization_id", currentOrganization.id);

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
