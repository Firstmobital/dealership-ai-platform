import { openai, supabase } from "./clients.ts";
import { KB_DISABLE_LEXICAL } from "./env.ts";
import type { KBScoredRow, createLogger } from "./logging.ts";
import {
  combinedScore,
  isOfferArticle,
  keywordMatchesIntent,
  looksLikePricingOrOfferContext,
  normalizeKeywords,
  type KBCandidate,
} from "./offers_pricing.ts";
import { safeSupabase } from "./safe_helpers.ts";
import { containsPhrase, normalizeForMatch } from "./text_normalize.ts";
import { sha256Hex } from "./trace.ts";

export function packKbContext(params: {
  rows: KBScoredRow[];
  maxChars: number; // total KB budget
  maxChunks: number; // hard cap
  maxChunkChars: number; // per-chunk cap
  maxPerArticle?: number; // diversity cap per article
}): {
  context: string;
  used: {
    id: string;
    article_id: string;
    title: string;
    similarity?: number;
    score: number;
  }[];
} {
  const {
    rows,
    maxChars,
    maxChunks,
    maxChunkChars,
    maxPerArticle = 4,
  } = params;

  // Diversity inside an article:
  // Avoid packing many near-duplicate chunks from the same region.
  // We don’t have chunk_index here, so we use a lightweight similarity key.
  const fingerprint = (text: string) => {
    const n = normalizeForMatch(text || "");
    // Focus near the start; chunks from same region tend to share leading tokens
    return n.split(" ").slice(0, 40).join(" ").trim();
  };

  const jaccard = (a: string, b: string) => {
    const as = new Set((a || "").split(" ").filter(Boolean));
    const bs = new Set((b || "").split(" ").filter(Boolean));
    if (!as.size || !bs.size) return 0;
    let inter = 0;
    for (const x of as) if (bs.has(x)) inter++;
    const union = as.size + bs.size - inter;
    return union ? inter / union : 0;
  };

  const tooSimilarToRecentInSameArticle = (
    article_id: string,
    chunkRaw: string,
    recentByArticle: Map<string, string[]>
  ) => {
    const fp = fingerprint(chunkRaw);
    const recent = recentByArticle.get(article_id) ?? [];
    // Compare against last few accepted chunks in that same article
    for (const prevFp of recent.slice(-3)) {
      if (prevFp === fp) return true;
      if (jaccard(prevFp, fp) >= 0.82) return true;
    }
    return false;
  };

  // Diversify by article: prevent 8 chunks from the same doc.
  // Strategy:
  // 1) Group rows by article_id
  // 2) Sort chunks within each article by score desc
  // 3) Sort articles by best score desc
  // 4) Round-robin pick chunks across top articles with per-article cap
  const groups = new Map<string, KBScoredRow[]>();
  const articleTitle = new Map<string, string>();

  for (const r of rows) {
    if (!groups.has(r.article_id)) groups.set(r.article_id, []);
    groups.get(r.article_id)!.push(r);
    if (!articleTitle.has(r.article_id))
      articleTitle.set(r.article_id, r.title);
  }

  const articleOrder = [...groups.entries()]
    .map(([article_id, rs]) => {
      rs.sort((a, b) => b.score - a.score);
      return {
        article_id,
        bestScore: rs[0]?.score ?? 0,
      };
    })
    .sort((a, b) => b.bestScore - a.bestScore);

  const used: {
    id: string;
    article_id: string;
    title: string;
    similarity?: number;
    score: number;
  }[] = [];
  const parts: string[] = [];
  const seen = new Set<string>();
  const usedCountByArticle = new Map<string, number>();
  const nextIndexByArticle = new Map<string, number>();
  const recentFingerprintsByArticle = new Map<string, string[]>();

  let remaining = maxChars;

  // Round-robin across articles until we hit caps/budget
  outer: while (parts.length < maxChunks && remaining > 200) {
    let progressed = false;

    for (const a of articleOrder) {
      if (parts.length >= maxChunks || remaining <= 200) break;

      const already = usedCountByArticle.get(a.article_id) ?? 0;
      if (already >= maxPerArticle) continue;

      const idx = nextIndexByArticle.get(a.article_id) ?? 0;
      const rs = groups.get(a.article_id) ?? [];
      if (idx >= rs.length) continue;

      const r = rs[idx];
      nextIndexByArticle.set(a.article_id, idx + 1);

      const raw = (r.chunk || "").trim();
      if (!raw) continue;

      // NEW: intra-article near-duplicate filter
      if (
        tooSimilarToRecentInSameArticle(
          a.article_id,
          raw,
          recentFingerprintsByArticle
        )
      ) {
        continue;
      }

      // Dedup by normalized prefix (global)
      const key = normalizeForMatch(raw).slice(0, 280);
      if (seen.has(key)) continue;
      seen.add(key);

      // Trim chunk to reduce token waste
      const chunk = raw.length > maxChunkChars ? raw.slice(0, maxChunkChars) : raw;

      const title = r.title || articleTitle.get(a.article_id) || "KB";
      const block = `### ${title}\n${chunk}`;
      if (block.length > remaining) continue;

      parts.push(block);
      remaining -= block.length + 2;

      used.push({
        id: r.id,
        article_id: r.article_id,
        title,
        similarity: r.similarity,
        score: r.score,
      });

      usedCountByArticle.set(a.article_id, already + 1);
      progressed = true;

      // Remember fingerprints for near-dup checks within this article
      const fp = fingerprint(raw);
      const arr = recentFingerprintsByArticle.get(a.article_id) ?? [];
      arr.push(fp);
      recentFingerprintsByArticle.set(a.article_id, arr);
    }

    if (!progressed) break outer;
  }

  return { context: parts.join("\n\n").trim(), used };
}

function _articleMatchesIntent(
  title: string,
  intent: "pricing" | "offer" | "features" | "service" | "other"
): boolean {
  const t = title.toLowerCase();

  if (intent === "pricing" || intent === "offer") {
    return (
      t.includes("price") ||
      t.includes("pricing") ||
      t.includes("on-road") ||
      t.includes("ex-showroom") ||
      t.includes("offer")
    );
  }

  if (intent === "features") {
    return t.includes("feature") || t.includes("spec") || t.includes("variant");
  }

  return true;
}

/* ============================================================================
   SEMANTIC KB RESOLVER (EMBEDDINGS-BASED)
============================================================================ */
async function rerankCandidates(params: {
  query: string;
  candidates: KBCandidate[];
  logger: ReturnType<typeof createLogger>;
}) {
  const { query, candidates, logger } = params;

  const scoreAt = (i: number) =>
    candidates[Math.min(i, candidates.length - 1)]?.score ?? 0;
  const gap = scoreAt(0) - scoreAt(5); // compare #1 vs #6
  const looksHighRisk = looksLikePricingOrOfferContext(query);

  // Rerank only when:
  // - high-risk query (pricing/offer/spec/policy-ish), OR
  // - the scores are “close” (ambiguous retrieval)
  const shouldRerank = candidates.length > 6 && (looksHighRisk || gap < 0.08);

  if (!shouldRerank) return candidates;

  const items = candidates.slice(0, 12).map((c, idx) => ({
    idx,
    id: c.id,
    title: c.title,
    chunk: c.chunk.slice(0, 700),
  }));

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: "You are a retrieval reranker. Return JSON only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            query,
            instruction:
              "Rank chunks by how directly they help answer the query. Prefer chunks with exact policy/price/specs when asked. Output JSON: { ranked: [{ idx, reason }] }",
            items,
          }),
        },
      ],
      response_format: { type: "json_object" } as any,
    });

    const text = resp.choices?.[0]?.message?.content ?? "{}";
    const json = JSON.parse(text);

    const rankedIdx: number[] = (json.ranked ?? [])
      .map((r: any) => Number(r.idx))
      .filter((n: any) => Number.isFinite(n));

    if (!rankedIdx.length) return candidates;

    const reordered: KBCandidate[] = [];
    const used = new Set<number>();

    for (const i of rankedIdx) {
      if (i >= 0 && i < candidates.length && !used.has(i)) {
        reordered.push(candidates[i]);
        used.add(i);
      }
    }

    // append leftovers
    for (let i = 0; i < candidates.length; i++) {
      if (!used.has(i)) reordered.push(candidates[i]);
    }

    return reordered;
  } catch (e) {
    logger.warn("[kb] rerank failed; fallback to scored order", {
      error: String(e),
    });
    return candidates;
  }
}

export async function resolveKnowledgeContextSemantic(params: {
  userMessage: string;
  organizationId: string;
  logger: ReturnType<typeof createLogger>;
  vehicleModel?: string | null;
  intent?: "pricing" | "offer" | "features" | "service" | "other";
  fuelType?: string | null;
}): Promise<{
  context: string;
  article_ids: string[];
  confidence: "strong" | "weak";
  best_similarity: number;
  best_score: number;
  option_titles: string[];
  debug: {
    used: {
      id: string;
      article_id: string;
      title: string;
      similarity?: number;
    }[];
    rejected: {
      id: string;
      article_id: string;
      title: string;
      similarity?: number;
      reason: string;
    }[];
    thresholds: {
      hardMin: number;
      softMin: number;
      initial: number;
      fallback: number;
    };
  };
} | null> {
  const { userMessage, organizationId, logger } = params;

  let intent = params.intent || "other";

  // Heuristic upgrade: ai-extract can miss short discount/price queries ("smart discount").
  // If the user message clearly signals pricing/offers, force the right KB mode so we pack the full article.
  const um = (userMessage || "").toLowerCase();
  const looksOffer =
    /\b(discount|offer|offers|scheme|stock offer|stock offers|deal|deals)\b/.test(
      um
    );
  const looksPricing =
    /\b(price|pricing|on[- ]?road|ex[- ]?showroom|quotation|quote|emi)\b/.test(
      um
    );

  if (intent === "other") {
    if (looksOffer) intent = "offer";
    else if (looksPricing) intent = "pricing";
  }

  // Phase 2: Keep KB *strict* to reduce hallucinations.
  // - First pass: higher threshold.
  // - Fallback: slightly lower, but still requires a hard minimum similarity.
  // NOTE: Offer/pricing queries are often phrased generically ("offers running?"),
  // so we allow a bit more recall and let reranking + scoring handle precision.
  const INITIAL_THRESHOLD =
    intent === "offer" ? 0.5 : intent === "pricing" ? 0.55 : 0.58;
  const FALLBACK_THRESHOLD =
    intent === "offer" ? 0.4 : intent === "pricing" ? 0.45 : 0.5;
  const HARD_MIN_SIMILARITY =
    intent === "offer" ? 0.3 : intent === "pricing" ? 0.36 : 0.48;
  const SOFT_MIN_SIMILARITY =
    intent === "offer" ? 0.48 : intent === "pricing" ? 0.52 : 0.55;

  try {
    // 1) Create embedding for user query (Phase 5: cache by org+model+text_hash)
    const EMBED_MODEL = "text-embedding-3-small";
    const raw = (userMessage || "").trim().replace(/\s+/g, " ");

    const normalized = raw
      .replace(/\bsmart\+/gi, "smart plus")
      .replace(/\+/g, " plus ");

    // Short-query expansion (embedding only):
    // If query is very short and intent is pricing/offer, embeddings can be weak.
    // Expand with stable pricing/offer tokens to improve recall without changing user-visible behavior.
    const isShort =
      normalized.length < 18 ||
      normalized.split(/\s+/).filter(Boolean).length < 3;

    const embedInput =
      (intent === "pricing" || intent === "offer") && isShort
        ? `${normalized} on-road price breakup ex-showroom insurance rto tcs discount offer scheme variant`
        : normalized;

    const textHash = await sha256Hex(embedInput.toLowerCase());

    // Cache lookup (service-role table; never blocks if it fails)
    let embedding: number[] | null = null;
    try {
      const { data: cached, error: cacheErr } = await supabase
        .from("ai_embeddings_cache")
        .select("embedding")
        .eq("organization_id", organizationId)
        .eq("model", EMBED_MODEL)
        .eq("text_hash", textHash)
        .maybeSingle();

      if (!cacheErr && cached?.embedding) {
        embedding = cached.embedding as unknown as number[];
      }
    } catch {
      // ignore cache failures
    }

    if (!embedding) {
      const embeddingResp = await openai.embeddings.create({
        model: EMBED_MODEL,
        input: embedInput,
      });

      const e = embeddingResp.data?.[0]?.embedding;
      if (!e) return null;
      embedding = e as unknown as number[];

      // Cache insert (best-effort)
      try {
        await supabase.from("ai_embeddings_cache").insert({
          organization_id: organizationId,
          model: EMBED_MODEL,
          text_hash: textHash,
          embedding,
        });
      } catch {
        // ignore cache write failures
      }
    }

    const VECTOR_COUNT = 40;
    const LEXICAL_COUNT = 40;

    const runVector = async (threshold: number) => {
      return await supabase.rpc("match_knowledge_chunks_scoped", {
        query_embedding: embedding,
        match_threshold: threshold,
        match_count: VECTOR_COUNT,
        p_organization_id: organizationId,
        p_only_published: true,
      });
    };

    const runLexical = async () => {
      return await supabase.rpc("match_knowledge_chunks_lexical_scoped", {
        p_query: normalized,
        match_count: LEXICAL_COUNT,
        p_organization_id: organizationId,
        p_only_published: true,
      });
    };

    // 2) Match KB chunks (strict → fallback)
    let vectorData: any[] = [];
    let vectorErr: any = null;

    const { data: v1, error: e1 } = await runVector(INITIAL_THRESHOLD);
    vectorErr = e1;
    vectorData = (v1 ?? []) as any[];

    if (
      (!vectorData.length || vectorErr) &&
      FALLBACK_THRESHOLD < INITIAL_THRESHOLD
    ) {
      const { data: v2, error: e2 } = await runVector(FALLBACK_THRESHOLD);
      vectorErr = e2;
      vectorData = (v2 ?? []) as any[];
    }

    // Lexical always runs (even if vector hits) to catch exact strings
    let lexData: any[] = [];
    let lexErr: any = null;

    if (!KB_DISABLE_LEXICAL) {
      const { data: lexDataRaw, error } = await runLexical();
      lexErr = error;
      lexData = (lexDataRaw ?? []) as any[];
    } else {
      logger.info("[kb] lexical disabled; skipping lexical rpc");
    }

    if ((!vectorData.length && !lexData.length) || vectorErr) {
      // if vector errors out entirely, treat as no KB (don’t crash)
      if (vectorErr)
        logger.warn("[kb] vector rpc failed", { error: vectorErr });
      if (lexErr) logger.warn("[kb] lexical rpc failed", { error: lexErr });
      if (!vectorData.length && !lexData.length) return null;
    }

    // ------------------------------------------------------------------
    // INTENT-SCOPED KEYWORDS (knowledge_articles.keywords)
    // Fetch keywords for candidate article_ids and use them to prefer intent-relevant docs.
    // Safe fallback: if no keyword matches exist, keep current behavior.
    // ------------------------------------------------------------------
    const candidateArticleIds = Array.from(
      new Set([
        ...vectorData.map((r) => String(r.article_id)),
        ...lexData.map((r) => String(r.article_id)),
      ].filter(Boolean))
    );

    const articleKeywordsMap = new Map<string, string[]>();
    if (candidateArticleIds.length) {
      const kwRows = await safeSupabase<{ id: string; keywords: any }[]>(
        "load_article_keywords_for_kb_candidates",
        logger,
        async () =>
          await supabase
            .from("knowledge_articles")
            .select("id,keywords")
            .eq("organization_id", organizationId)
            .in("id", candidateArticleIds)
      );

      for (const r of kwRows ?? []) {
        articleKeywordsMap.set(String((r as any).id), normalizeKeywords((r as any).keywords));
      }
    }

    // Merge candidates by chunk id
    const merged = new Map<string, KBCandidate>();

    for (const r of vectorData) {
      const id = String(r.id);
      const sim = Number(r.similarity ?? 0);
      merged.set(id, {
        id,
        article_id: String(r.article_id),
        title: String(r.article_title || "KB"),
        chunk: String(r.chunk || ""),
        similarity: sim,
        score: combinedScore(sim, undefined, intent),
      });
    }

    for (const r of lexData) {
      const id = String(r.id);
      const rank = Number(r.rank ?? 0);
      const existing = merged.get(id);
      if (existing) {
        existing.rank = rank;
        existing.score = combinedScore(existing.similarity, rank, intent);
      } else {
        merged.set(id, {
          id,
          article_id: String(r.article_id),
          title: String(r.article_title || "KB"),
          chunk: String(r.chunk || ""),
          rank,
          score: combinedScore(undefined, rank, intent),
        });
      }
    }

    const rows = [...merged.values()];

    // 3) Post-filter + ranking
    const model = (params.vehicleModel || "").trim();
    const modelNorm = model ? normalizeForMatch(model) : "";

    const used: {
      id: string;
      article_id: string;
      title: string;
      similarity: number;
    }[] = [];
    const rejected: {
      id: string;
      article_id: string;
      title: string;
      similarity: number;
      reason: string;
    }[] = [];

    // Helper: boost if model string appears in title/chunk or if article keywords match intent
    function boostScore(params: {
      baseScore: number;
      title: string;
      chunk: string;
      article_id: string;
      intent: "pricing" | "offer" | "features" | "service" | "other";
    }): number {
      let score = params.baseScore;

      const t = normalizeForMatch(params.title);
      const c = normalizeForMatch(params.chunk);
      const text = `${t} ${c}`;

      // 0) Intent-scoped keyword preference (primary)
      const kws = articleKeywordsMap.get(params.article_id) ?? [];
      const kwMatch = keywordMatchesIntent({ articleKeywords: kws, intent: params.intent });
      if (kwMatch) {
        // Strong but bounded bump; we still allow highly relevant non-keyword docs.
        score += 0.18;
      }

      // 1) Model boost (your existing logic)
      if (modelNorm) {
        if (t.includes(modelNorm)) score += 0.06;
        if (containsPhrase(c, modelNorm)) score += 0.04;
      }

      // 1.5) Offer anchor boost
      if (
        params.intent === "offer" &&
        isOfferArticle(params.title, params.chunk)
      ) {
        score += 0.25;
      }

      // 2) Intent boost (existing)
      const pricingSignals = [
        "price",
        "pricing",
        "ex showroom",
        "ex-showroom",
        "on road",
        "on-road",
        "esp",
        "emi",
        "rto",
        "insurance",
        "down payment",
        "discount",
        "offer",
        "final deal",
        "total",
        "breakup",
        "cost",
        "tax",
        "registration",
        "fees",
      ];

      const featuresSignals = [
        "feature",
        "features",
        "spec",
        "specs",
        "variant-wise features",
        "equipment",
        "safety",
        "infotainment",
        "interior",
        "exterior",
        "dimension",
        "capacity",
        "performance",
        "mileage",
        "engine",
        "transmission",
        "tyre",
        "warranty",
      ];

      const isPricingish = pricingSignals.some((k) => text.includes(k));
      const isFeaturesish = featuresSignals.some((k) => text.includes(k));

      if (params.intent === "pricing") {
        if (isPricingish) score += 0.12;
        if (isFeaturesish) score -= 0.05;

        const offerSignals = [
          "discount",
          "offer",
          "scheme",
          "special offer",
          "exchange",
          "corporate",
          "loyalty",
        ];
        const isOfferish = offerSignals.some((k) => text.includes(k));
        if (isOfferish) score += 0.03;
      } else if (params.intent === "offer") {
        const offerSignals = [
          "discount",
          "offer",
          "scheme",
          "special offer",
          "exchange",
          "corporate",
          "loyalty",
        ];
        const isOfferish = offerSignals.some((k) => text.includes(k));

        if (isOfferish) score += 0.14;
        if (isPricingish && !isOfferish) score -= 0.04;
        if (isFeaturesish) score -= 0.05;
      } else if (params.intent === "features") {
        if (isFeaturesish) score += 0.08;
      }

      return score;
    }

    // Reject obvious noise
    const viable: KBScoredRow[] = [];

    for (const r of rows) {
      const chunk = (r.chunk || "").trim();
      if (!chunk) {
        rejected.push({
          id: r.id,
          article_id: r.article_id,
          title: r.title,
          similarity: typeof r.similarity === "number" ? r.similarity : 0,
          reason: "empty_chunk",
        });
        continue;
      }

      // Hard reject only if vector similarity exists AND is below hard min.
      if (
        typeof r.similarity === "number" &&
        r.similarity < HARD_MIN_SIMILARITY
      ) {
        rejected.push({
          id: r.id,
          article_id: r.article_id,
          title: r.title,
          similarity: r.similarity,
          reason: "below_hard_min",
        });
        continue;
      }

      const sim = typeof r.similarity === "number" ? r.similarity : undefined;
      const rank = typeof r.rank === "number" ? r.rank : undefined;

      const baseScore = combinedScore(sim, rank, intent);
      const articleKeywords = articleKeywordsMap.get(r.article_id) ?? [];

      viable.push({
        id: r.id,
        article_id: r.article_id,
        title: r.title,
        chunk,
        similarity: sim,
        rank,
        keywords: articleKeywords,
        score: boostScore({
          baseScore,
          title: r.title,
          chunk,
          article_id: r.article_id,
          intent,
        }),
      });
    }

    if (!viable.length) return null;

    // ------------------------------------------------------------------
    // INTENT-SCOPED FILTERING (SAFE-FALLBACK)
    // If any viable chunks come from articles whose keywords match the intent,
    // restrict to those to prevent cross-topic leakage.
    // If none match (or keywords missing), keep current behavior.
    // ------------------------------------------------------------------
    const hasAnyKeywordMatches = viable.some((v) =>
      keywordMatchesIntent({ articleKeywords: v.keywords, intent })
    );
    if (hasAnyKeywordMatches) {
      const filtered = viable.filter((v) =>
        keywordMatchesIntent({ articleKeywords: v.keywords, intent })
      );
      if (filtered.length) {
        const dropped = viable.length - filtered.length;
        if (dropped > 0) {
          logger.info("[kb] intent_keyword_filter_applied", {
            intent,
            kept: filtered.length,
            dropped,
            kept_articles: Array.from(new Set(filtered.map((x) => x.article_id))).slice(0, 12),
          });
        }
        viable.length = 0;
        viable.push(...filtered);
      }
    }

    // ------------------------------------------------------------------
    // OFFER ANCHOR: existing behavior (still applies after keyword filtering)
    // ------------------------------------------------------------------
    if (intent === "offer") {
      const offerOnly = viable.filter((v) => isOfferArticle(v.title, v.chunk));
      if (offerOnly.length) {
        const dropped = viable.length - offerOnly.length;
        if (dropped > 0) {
          logger.info("[kb] offer_anchor_applied", {
            kept: offerOnly.length,
            dropped,
            top_titles: [...new Set(offerOnly.slice(0, 3).map((x) => x.title))],
          });
        }
        viable.length = 0;
        viable.push(...offerOnly);
      }
    }

    // Sort by boosted score desc (tie-break by similarity)
    viable.sort(
      (a, b) => b.score - a.score || (b.similarity ?? 0) - (a.similarity ?? 0)
    );

    // Rerank top candidates for better precision
    const reranked = await rerankCandidates({
      query: normalized,
      candidates: viable.map((v) => ({
        id: v.id,
        article_id: v.article_id,
        title: v.title,
        chunk: v.chunk,
        similarity: v.similarity,
        score: v.score,
      })),
      logger,
    });

    // Rebuild viable in reranked order (preserve KBScoredRow shape)
    const viableReranked: KBScoredRow[] = [];
    for (const c of reranked) {
      const found = viable.find((v) => v.id === c.id);
      if (found) viableReranked.push(found);
    }
    viable.length = 0;
    viable.push(...viableReranked);

    // Determine confidence: strong vs weak (best-effort KB still allowed)
    const best = viable[0];

    // If lexical rank exists, let score drive confidence.
    // Vector similarity is optional.
    const hasLexicalEvidence = typeof best.rank === "number" && best.rank > 0;
    const hasVectorEvidence = typeof best.similarity === "number";

    const confidence: "strong" | "weak" =
      best.score >= 0.62 ||
      (hasVectorEvidence && best.similarity! >= SOFT_MIN_SIMILARITY) ||
      (hasLexicalEvidence && best.score >= 0.55)
        ? "strong"
        : "weak";

    if (confidence === "weak") {
      logger.warn("[kb] semantic match weak; injecting best-effort KB", {
        best_similarity: best.similarity ?? 0,
        best_title: best.title,
        vehicle_model: model || null,
      });
    }

    // 4) Build compact context from top rows with dedupe
    // 4) Pack context by budget (dynamic, no sim metadata)
    const pricingMode = intent === "pricing" || intent === "offer";

    // 🔒 Pricing requires full-article coverage
    if (pricingMode) {
      const byArticle = new Map<string, KBScoredRow[]>();
      for (const r of viable) {
        if (!byArticle.has(r.article_id)) byArticle.set(r.article_id, []);
        byArticle.get(r.article_id)!.push(r);
      }
    }

    const packed = packKbContext({
      rows: viable,
      maxChars: pricingMode ? 16000 : 11000,
      maxChunks: pricingMode ? 30 : 18,
      maxChunkChars: pricingMode ? 4000 : 1200,
      maxPerArticle: pricingMode ? 12 : 3,
    });

    const context = packed.context;
    if (!context) return null;

    const usedArticleIds = new Set<string>(
      packed.used.map((u) => u.article_id)
    );

    for (const u of packed.used) {
      used.push({
        id: u.id,
        article_id: u.article_id,
        similarity: u.similarity ?? 0,
        title: u.title,
      });
    }

    logger.info("[kb] semantic injected", {
      chars: context.length,
      vehicle_model: model || null,
      articles: [...usedArticleIds],
      used: used.map((u) => ({ title: u.title, similarity: u.similarity })),
    });

    return {
      context,
      article_ids: [...usedArticleIds],
      confidence,
      best_similarity: best.similarity ?? 0,
      best_score: best.score,
      option_titles: Array.from(new Set(used.map((u) => u.title)))
        .filter(Boolean)
        .slice(0, 6),
      debug: {
        used,
        rejected,
        thresholds: {
          hardMin: HARD_MIN_SIMILARITY,
          softMin: SOFT_MIN_SIMILARITY,
          initial: INITIAL_THRESHOLD,
          fallback: FALLBACK_THRESHOLD,
        },
      },
    };
  } catch (err) {
    logger.error("[kb] semantic resolver failed", { error: err });
    return null;
  }
}
