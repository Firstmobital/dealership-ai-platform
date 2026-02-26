import { supabase } from "./clients.ts";
import { KB_DISABLE_LEXICAL } from "./env.ts";
import type { KBScoredRow, createLogger } from "./logging.ts";
import { combinedScore, normalizeKeywords } from "./offers_pricing.ts";
import { safeSupabase } from "./safe_helpers.ts";
import { packKbContext } from "./kb_semantic.ts";

export async function resolveKnowledgeContextLexicalOnly(params: {
  userMessage: string;
  organizationId: string;
  logger: ReturnType<typeof createLogger>;
}): Promise<{ context: string; article_ids: string[] } | null> {
  const { userMessage, organizationId, logger } = params;
  if (KB_DISABLE_LEXICAL) return null;
  const q = (userMessage || "").trim().replace(/\s+/g, " ");
  if (!q) return null;

  const { data, error } = await supabase.rpc(
    "match_knowledge_chunks_lexical_scoped",
    {
      p_query: q,
      match_count: 40,
      p_organization_id: organizationId,
      p_only_published: true,
    }
  );

  if (error) {
    logger.warn("[kb] lexical-only rpc failed", { error });
    return null;
  }
  if (!data?.length) return null;

  const rawRows = data as any[];
  const articleIdsList = Array.from(
    new Set(rawRows.map((r) => String(r.article_id)).filter(Boolean))
  );

  const articleKeywordsMap = new Map<string, string[]>();
  if (articleIdsList.length) {
    const kwRows = await safeSupabase<{ id: string; keywords: any }[]>(
      "load_article_keywords_for_lexical_kb_candidates",
      logger,
      async () =>
        await supabase
          .from("knowledge_articles")
          .select("id,keywords")
          .eq("organization_id", organizationId)
          .in("id", articleIdsList)
    );

    for (const r of kwRows ?? []) {
      articleKeywordsMap.set(String((r as any).id), normalizeKeywords((r as any).keywords));
    }
  }

  // Convert to KBScoredRow so we can reuse the same packing/diversification.
  const rows: KBScoredRow[] = rawRows.map((r) => {
    const rank = Number(r.rank ?? 0);
    const article_id = String(r.article_id);
    return {
      id: String(r.id),
      article_id,
      title: String(r.article_title || "KB"),
      chunk: String(r.chunk || ""),
      similarity: undefined,
      rank,
      keywords: articleKeywordsMap.get(article_id) ?? [],
      score: combinedScore(undefined, rank),
    };
  });

  const packed = packKbContext({
    rows,
    maxChars: 9000,
    maxChunks: 12,
    maxChunkChars: 1200,
    maxPerArticle: 3,
  });

  const context = packed.context;
  if (!context) return null;

  const articleIds = new Set<string>(packed.used.map((u) => u.article_id));

  logger.info("[kb] lexical-only injected", {
    articles: [...articleIds],
    chars: context.length,
  });
  return { context, article_ids: [...articleIds] };
}
