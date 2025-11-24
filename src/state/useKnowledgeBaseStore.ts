// src/state/useKnowledgeBaseStore.ts
import { create } from "zustand";
import { supabase } from "../lib/supabaseClient";
import { useOrganizationStore } from "./useOrganizationStore";
import { useSubOrganizationStore } from "./useSubOrganizationStore";
import type { KnowledgeArticle } from "../types/database";

type KnowledgeBaseState = {
  articles: KnowledgeArticle[];
  loading: boolean;
  uploading: boolean;
  error: string | null;
  selectedArticle: KnowledgeArticle | null;
  searchTerm: string;

  // Actions
  fetchArticles: () => Promise<void>;
  createArticleFromText: (params: {
    title: string;
    content: string;
  }) => Promise<void>;
  createArticleFromFile: (params: {
    file: File;
    title?: string;
  }) => Promise<void>;
  deleteArticle: (articleId: string) => Promise<void>;
  setSelectedArticle: (article: KnowledgeArticle | null) => void;
  setSearchTerm: (term: string) => void;
};

export const useKnowledgeBaseStore = create<KnowledgeBaseState>((set, get) => ({
  articles: [],
  loading: false,
  uploading: false,
  error: null,
  selectedArticle: null,
  searchTerm: "",

  setSelectedArticle: (article) => set({ selectedArticle: article }),
  setSearchTerm: (term) => set({ searchTerm: term }),

  /**
   * Fetch knowledge articles for the current organization + sub-organization.
   * We treat `content` as a short abstract/summary for dashboard display.
   */
  fetchArticles: async () => {
    const { currentOrganization } = useOrganizationStore.getState();
    const { activeSubOrg } = useSubOrganizationStore.getState();
    const { searchTerm } = get();

    if (!currentOrganization) {
      set({
        error: "Select an organization to view its knowledge base.",
        articles: [],
      });
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
        query = query.eq("sub_organization_id", activeSubOrg.id);
      } else {
        query = query.is("sub_organization_id", null);
      }

      const { data, error } = await query;

      if (error) {
        console.error("[KB] fetchArticles error:", error);
        set({
          loading: false,
          error: error.message ?? "Failed to load knowledge base.",
          articles: [],
        });
        return;
      }

      let articles = (data ?? []) as KnowledgeArticle[];

      // Optional client-side search filter by title/content
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        articles = articles.filter((a) => {
          const title = (a.title ?? "").toLowerCase();
          const content = (a.content ?? "").toLowerCase();
          return title.includes(term) || content.includes(term);
        });
      }

      set({
        loading: false,
        error: null,
        articles,
      });
    } catch (err: any) {
      console.error("[KB] fetchArticles exception:", err);
      set({
        loading: false,
        error: err?.message ?? "Unexpected error while loading KB.",
        articles: [],
      });
    }
  },

  /**
   * Create a knowledge article from raw text.
   * We delegate chunking + embeddings to the `ai-generate-kb` edge function.
   * - `content` here is the full raw text.
   * - The function is responsible for:
   *    - generating an abstract/short summary and storing in `knowledge_articles.content`
   *    - inserting detailed chunks into `knowledge_chunks`.
   */
  createArticleFromText: async ({ title, content }) => {
    const { currentOrganization } = useOrganizationStore.getState();
    const { activeSubOrg } = useSubOrganizationStore.getState();

    if (!currentOrganization) {
      set({ error: "Select an organization before adding knowledge." });
      return;
    }

    if (!content.trim()) {
      set({ error: "Content cannot be empty." });
      return;
    }

    set({ uploading: true, error: null });

    try {
      const { error } = await supabase.functions.invoke("ai-generate-kb", {
        body: {
          organization_id: currentOrganization.id,
          sub_organization_id: activeSubOrg?.id ?? null,
          source_type: "text",
          title,
          content,
        },
      });

      if (error) {
        console.error("[KB] createArticleFromText error:", error);
        set({
          uploading: false,
          error: error.message ?? "Failed to ingest knowledge text.",
        });
        return;
      }

      // Refresh articles list
      await get().fetchArticles();

      set({
        uploading: false,
        error: null,
      });
    } catch (err: any) {
      console.error("[KB] createArticleFromText exception:", err);
      set({
        uploading: false,
        error: err?.message ?? "Unexpected error while ingesting knowledge.",
      });
    }
  },

  /**
   * Create a knowledge article from a file upload.
   * Flow:
   * 1. Upload file to `knowledge-base` storage bucket.
   * 2. Call `ai-generate-kb` with source_type="file" + file metadata.
   * 3. Edge function:
   *    - downloads file
   *    - extracts text
   *    - generates abstract -> stores in knowledge_articles.content
   *    - chunks + embeds -> stores in knowledge_chunks
   */
  createArticleFromFile: async ({ file, title }) => {
    const { currentOrganization } = useOrganizationStore.getState();
    const { activeSubOrg } = useSubOrganizationStore.getState();

    if (!currentOrganization) {
      set({ error: "Select an organization before uploading knowledge files." });
      return;
    }

    if (!file) {
      set({ error: "No file selected." });
      return;
    }

    set({ uploading: true, error: null });

    try {
      const bucket = "knowledge-base";
      const safeName = file.name.replace(/\s+/g, "_");
      const path = `${currentOrganization.id}/${Date.now()}-${safeName}`;

      // 1) Upload file to storage
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, file);

      if (uploadError) {
        console.error("[KB] createArticleFromFile upload error:", uploadError);
        set({
          uploading: false,
          error: uploadError.message ?? "Failed to upload knowledge file.",
        });
        return;
      }

      // 2) Invoke edge function to process the file
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
            mime_type: file.type || null,
          },
        }
      );

      if (invokeError) {
        console.error(
          "[KB] createArticleFromFile invoke error:",
          invokeError
        );
        set({
          uploading: false,
          error:
            invokeError.message ?? "Failed to ingest knowledge from the file.",
        });
        return;
      }

      // 3) Refresh list
      await get().fetchArticles();

      set({
        uploading: false,
        error: null,
      });
    } catch (err: any) {
      console.error("[KB] createArticleFromFile exception:", err);
      set({
        uploading: false,
        error:
          err?.message ??
          "Unexpected error while ingesting knowledge from file.",
      });
    }
  },

  /**
   * Delete a knowledge article and (optionally) its chunks.
   * We assume a DB ON DELETE CASCADE or a helper RPC will remove chunks.
   */
  deleteArticle: async (articleId: string) => {
    const { currentOrganization } = useOrganizationStore.getState();

    if (!currentOrganization) {
      set({ error: "Select an organization first." });
      return;
    }

    set({ loading: true, error: null });

    try {
      const { error } = await supabase
        .from("knowledge_articles")
        .delete()
        .eq("id", articleId)
        .eq("organization_id", currentOrganization.id);

      if (error) {
        console.error("[KB] deleteArticle error:", error);
        set({
          loading: false,
          error: error.message ?? "Failed to delete knowledge article.",
        });
        return;
      }

      // Refresh list
      await get().fetchArticles();
      set({ loading: false, error: null });
    } catch (err: any) {
      console.error("[KB] deleteArticle exception:", err);
      set({
        loading: false,
        error: err?.message ?? "Unexpected error while deleting article.",
      });
    }
  },
}));
