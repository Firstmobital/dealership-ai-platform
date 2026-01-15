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

  reset: () => void;

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

  /* -----------------------------------------------------------
     STATE HELPERS
  ----------------------------------------------------------- */
  reset: () =>
    set({
      articles: [],
      loading: false,
      uploading: false,
      error: null,
      selectedArticle: null,
      searchTerm: "",
    }),

  setSelectedArticle: (article) => set({ selectedArticle: article }),
  setSearchTerm: (term) => set({ searchTerm: term }),

  /* -----------------------------------------------------------
     FETCH ARTICLES (includes processing_status)
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
     CREATE FROM TEXT (IMMEDIATE EMBED)
  ----------------------------------------------------------- */
  createArticleFromText: async ({ title, content, keywords, status }) => {
    const { activeOrganization } = useOrganizationStore.getState();
    if (!activeOrganization) return;

    set({ uploading: true, error: null });

    try {
      const { data, error } = await supabase
        .from("knowledge_articles")
        .insert({
          organization_id: activeOrganization.id,
          source_type: "text",
          title,
          content,
          keywords: Array.isArray(keywords) ? keywords : [],
          status: status ?? "draft",
          processing_status: "completed",
        })
        .select("id")
        .single();

      if (error || !data) throw error;

      await supabase.functions.invoke("embed-article", {
        body: { article_id: data.id },
      });

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
     CREATE FROM FILE (PDF / Excel)
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

      // Upload file
      await supabase.storage.from(bucket).upload(path, file, {
        contentType: file.type,
        upsert: false,
      });

      // Create article placeholder
      const { data: article, error } = await supabase
        .from("knowledge_articles")
        .insert({
          organization_id: activeOrganization.id,
          source_type: "file",
          title: title || file.name,
          content: "",
          status: status ?? "draft",
          keywords: Array.isArray(keywords) ? keywords : [],
          file_bucket: bucket,
          file_path: path,
          mime_type: file.type,
          original_filename: file.name,
          processing_status: "extracting_text",
        })
        .select("id")
        .single();

      if (error || !article) throw error;

      // Route processing
      if (file.type === "application/pdf") {
        await supabase.functions.invoke("pdf-to-text", {
          body: {
            bucket,
            path,
            organization_id: activeOrganization.id,
            article_id: article.id,
            mime_type: file.type,
          },
        });
      } else {
        await supabase.functions.invoke("ai-generate-kb", {
          body: {
            organization_id: activeOrganization.id,
            article_id: article.id,
            file_bucket: bucket,
            file_path: path,
            mime_type: file.type,
            original_filename: file.name,
          },
        });
      }

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
     REPLACE FILE (REPROCESS + RE-EMBED)
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

      await supabase.storage.from(bucket).upload(path, file, {
        contentType: file.type,
        upsert: false,
      });

      await supabase
        .from("knowledge_articles")
        .update({
          file_bucket: bucket,
          file_path: path,
          mime_type: file.type,
          original_filename: file.name,
          keywords: Array.isArray(keywords)
            ? keywords
            : article.keywords ?? [],
          processing_status: "extracting_text",
        })
        .eq("id", article.id);

      if (file.type === "application/pdf") {
        await supabase.functions.invoke("pdf-to-text", {
          body: {
            bucket,
            path,
            organization_id: activeOrganization.id,
            article_id: article.id,
            mime_type: file.type,
          },
        });
      } else {
        await supabase.functions.invoke("ai-generate-kb", {
          body: {
            organization_id: activeOrganization.id,
            article_id: article.id,
            file_bucket: bucket,
            file_path: path,
            mime_type: file.type,
            original_filename: file.name,
          },
        });
      }

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

    const { data, error } = await supabase.storage
      .from(article.file_bucket)
      .createSignedUrl(article.file_path, 60);

    if (error || !data?.signedUrl) {
      set({ error: "Failed to download file" });
      return;
    }

    window.open(data.signedUrl, "_blank");
  },

  /* -----------------------------------------------------------
     UPDATE ARTICLE (RE-EMBED ON CONTENT CHANGE)
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

      await supabase
        .from("knowledge_articles")
        .update(payload)
        .eq("id", id)
        .eq("organization_id", activeOrganization.id);

      if (content !== undefined) {
        await supabase.functions.invoke("embed-article", {
          body: { article_id: id },
        });
      }

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
      await supabase
        .from("knowledge_articles")
        .delete()
        .eq("id", articleId)
        .eq("organization_id", activeOrganization.id);

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
