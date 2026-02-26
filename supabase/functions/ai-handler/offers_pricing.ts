import { supabase } from "./clients.ts";
import { safeSupabase } from "./safe_helpers.ts";
import { containsPhrase, normalizeForMatch } from "./text_normalize.ts";
import type { createLogger } from "./logging.ts";

/* ==========================================================================
   OFFER ARTICLE ANCHORING
   Any "offer/discount" query should preferentially retrieve from the
   dedicated offers article (Special Stock Offers / Limited Stock), to avoid
   cross-model leakage and hallucinations.
============================================================================ */

const OFFER_ARTICLE_HINTS = [
  "special stock offers",
  "special offers",
  "limited stock",
  "discounted price",
  "total discount",
];

export function isOfferArticle(title: string, chunk: string): boolean {
  const t = normalizeForMatch(title || "");
  const c = normalizeForMatch(chunk || "");
  const joined = `${t} ${c}`;
  // Must contain at least one strong hint.
  return OFFER_ARTICLE_HINTS.some((h) => joined.includes(normalizeForMatch(h)));
}

export async function fetchOfferCatalogText(params: {
  organizationId: string;
  logger: ReturnType<typeof createLogger>;
  model?: string | null;
}): Promise<string | null> {
  const { organizationId, logger } = params;
  const model = (params.model || "").trim();

  // 1) Find likely offers articles by title (deterministic)
  const articles = await safeSupabase<{ id: string; title: string }[]>(
    "fetch_offer_articles",
    logger,
    async () => {
      return await supabase
        .from("knowledge_articles")
        .select("id,title")
        .eq("organization_id", organizationId)
        .ilike("title", "%stock%offer%")
        .limit(5);
    }
  );

  let articleIds = (articles || []).map((a) => String((a as any).id));

  // 1.5) Fallback: if title doesn't match, locate by chunk signals (MODEL: + Discount Amount)
  if (!articleIds.length) {
    const chunkHits = await safeSupabase<any[]>(
      "fetch_offer_articles_by_chunk",
      logger,
      async () => {
        return await supabase
          .from("knowledge_chunks")
          .select("article_id")
          .eq("organization_id", organizationId)
          .ilike("chunk", "%MODEL:%")
          .ilike("chunk", "%Discount Amount%")
          .limit(10);
      }
    );

    articleIds = [
      ...new Set((chunkHits || []).map((r) => String(r.article_id))),
    ];
  }

  if (!articleIds.length) return null;

  // 2) Pull all chunks for those articles
  let query = supabase
    .from("knowledge_chunks")
    .select("id,article_id,chunk,chunk_index,knowledge_articles(title)")
    .eq("organization_id", organizationId)
    .in("article_id", articleIds)
    .order("chunk_index", { ascending: true })
    .limit(250);

  // If model is specified, try to filter chunks down to only those that mention the model.
  // (Still best-effort; if filtering returns nothing, we fall back to full article.)
  if (model) {
    const modelNorm = model.replace(/[\s]+/g, " ").trim();
    query = query.ilike("chunk", `%${modelNorm}%`);
  }

  const modelFiltered = await safeSupabase<any[]>(
    "fetch_offer_catalog_chunks",
    logger,
    async () => await query
  );

  let rows = modelFiltered || [];

  // If model-filtered fetch returned nothing, fetch full catalog.
  if (!rows.length && model) {
    const allRows = await safeSupabase<any[]>(
      "fetch_offer_catalog_chunks_all",
      logger,
      async () => {
        return await supabase
          .from("knowledge_chunks")
          .select("id,article_id,chunk,chunk_index,knowledge_articles(title)")
          .eq("organization_id", organizationId)
          .in("article_id", articleIds)
          .order("chunk_index", { ascending: true })
          .limit(250);
      }
    );
    rows = allRows || [];
  }

  if (!rows.length) return null;

  // 3) Concatenate, prioritizing obvious offer-like chunks.
  const chunks = rows.map((r) => String(r.chunk || "").trim()).filter(Boolean);

  const joined = chunks.join("\n\n").trim();
  if (!joined) return null;

  logger.info("[offer] offer_catalog_fetched", {
    article_ids: articleIds,
    chunks: chunks.length,
    model: model || null,
  });

  return joined;
}

export type KBCandidate = {
  id: string;
  article_id: string;
  title: string;
  chunk: string;
  similarity?: number; // vector similarity 0..1
  rank?: number; // lexical rank (ts_rank_cd), > 0
  score: number; // combined score
};

function normalizeLexicalRank(r?: number): number {
  if (!r || r <= 0) return 0;
  // ts_rank_cd varies; clamp to 0..1 with a soft divisor you can tune later
  return Math.min(1, r / 2.5);
}

export function combinedScore(
  sim?: number,
  rank?: number,
  intent: "pricing" | "offer" | "features" | "service" | "other" = "other"
): number {
  const v = sim ?? 0;
  const l = normalizeLexicalRank(rank);

  // Intent-aware weights:
  // Pricing/offer needs lexical + exact matches more than embeddings.
  if (intent === "pricing" || intent === "offer") {
    return 0.6 * (sim ?? 0) + 0.4 * normalizeLexicalRank(rank);
  }

  // Features/specs usually fine with embeddings
  return 0.65 * v + 0.35 * l;
}

export function normalizeKeywords(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => String(x || "").trim().toLowerCase())
    .filter(Boolean);
}

function intentPreferredKeywords(
  intent: "pricing" | "offer" | "features" | "service" | "other"
): string[] {
  if (intent === "pricing") return ["pricing", "price", "on-road", "on road", "ex-showroom", "ex showroom"];
  if (intent === "offer") return ["offer", "offers", "discount", "scheme", "special offer", "stock offer"];
  if (intent === "service") return ["service", "servicing", "workshop", "maintenance"];
  if (intent === "features") return ["features", "feature", "specs", "spec", "specification", "specifications", "variants"];
  return [];
}

export function keywordMatchesIntent(params: {
  articleKeywords: string[] | undefined;
  intent: "pricing" | "offer" | "features" | "service" | "other";
}): boolean {
  const kws = (params.articleKeywords || []).map((k) => k.toLowerCase());
  if (!kws.length) return false;
  const preferred = intentPreferredKeywords(params.intent);
  if (!preferred.length) return false;
  // Match if any preferred keyword is present as a whole keyword token.
  return preferred.some((p) => kws.includes(p));
}

/* ============================================================================
   PRICING/OFFER PARSERS (KB → STRUCTURED ANSWERS)
============================================================================ */
type OfferEntry = {
  model: string;
  variant: string;
  fuel: string | null;
  transmission: string | null;
  manufacturing_year: string | null;
  color: string | null;
  original_price: string | null;
  discounted_price: string | null;
  total_discount: string | null;
};

function normalizePriceToken(v: string): string {
  // Keep only digits (so "₹10,19,990" == "1019990")
  return (v || "").replace(/[^0-9]/g, "");
}

function formatRupee(raw: string): string {
  // Prefer the raw formatting from KB (keeps commas/₹ if present).
  const s = (raw || "").trim();
  if (!s) return "";
  return s.startsWith("₹") ? s : `₹${s}`;
}

export function extractOfferEntriesFromText(text: string): OfferEntry[] {
  const t = (text || "").trim();
  if (!t) return [];

  // Normalize formatting (we can't rely on newlines because KB chunks may be single-line)
  const normalized = t
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .trim();

  const entries: OfferEntry[] = [];

  // Helper: extract field value until the next known label or end
  const pick = (src: string, label: string): string | null => {
    const re = new RegExp(
      `\\b${label}\\s*:\\s*([^]+?)\\s*(?=\\bVariant\\s*:|\\bMODEL\\s*:|\\bFuel\\s*:|\\bTransmission\\s*:|\\bColor(?: Options)?\\s*:|\\bManufacturing Year\\s*:|\\bPricing\\s*:|\\bOriginal(?:\\s+Ex-Showroom)?\\s+Price\\s*:|\\bDiscount Amount\\s*:|\\bFinal(?:\\s+Discounted)?(?:\\s+Ex-Showroom)?\\s+Price\\s*:|$)`,
      "i"
    );
    const m = src.match(re);
    return (m?.[1] || "").trim() || null;
  };

  const hasModelMarkers = /\bMODEL\s*:/i.test(normalized);

  // Split into MODEL blocks if present; otherwise treat whole text as a single block
  const modelBlocks = hasModelMarkers
    ? normalized
        .split(/\bMODEL\s*:\s*/i)
        .map((p) => p.trim())
        .filter(Boolean)
    : [normalized];

  for (const mb of modelBlocks) {
    let model = "";
    let body = mb;

    if (hasModelMarkers) {
      // model name is before the first "Variant:" (or before a newline if present)
      const idxVar = body.search(/\bVariant\s*:\s*/i);
      if (idxVar >= 0) {
        model = body.slice(0, idxVar).trim();
        body = body.slice(idxVar);
      } else {
        // If no variants, skip
        continue;
      }
    } else {
      // Try to infer model from an inline "MODEL:" marker (rare) or leave blank
      model = (pick(body, "MODEL") || "").trim();
    }

    // Split variants inside the model body
    const vparts = body.split(/\bVariant\s*:\s*/i).map((p) => p.trim());
    if (vparts.length <= 1) continue;

    for (let j = 1; j < vparts.length; j++) {
      const vraw = vparts[j];

      // Variant name is the text up to the next known label
      const variantName = (
        vraw.match(
          /^([^]+?)(?=\bFuel\s*:|\bTransmission\s*:|\bColor(?: Options)?\s*:|\bManufacturing Year\s*:|\bPricing\s*:|\bOriginal(?:\s+Ex-Showroom)?\s+Price\s*:|\bDiscount Amount\s*:|\bFinal(?:\s+Discounted)?(?:\s+Ex-Showroom)?\s+Price\s*:|\bVariant\s*:|\bMODEL\s*:|$)/i
        )?.[1] || ""
      )
        .replace(/\s+/g, " ")
        .trim();

      const fuel = pick(vraw, "Fuel");
      const transmission = pick(vraw, "Transmission");
      const color = pick(vraw, "Color Options") ?? pick(vraw, "Color");
      const manufacturing_year = pick(vraw, "Manufacturing Year");

      const original_price =
        pick(vraw, "Original Ex-Showroom Price") ??
        pick(vraw, "Original Price");
      const total_discount = pick(vraw, "Discount Amount");
      const discounted_price =
        pick(vraw, "Final Discounted Ex-Showroom Price") ??
        pick(vraw, "Final Discounted Price") ??
        pick(vraw, "Final Ex-Showroom Price") ??
        pick(vraw, "Final Price");

      const modelFinal = (model || "").replace(/\s+/g, " ").trim();
      if (!modelFinal || !variantName) continue;

      entries.push({
        model: modelFinal,
        variant: variantName,
        fuel,
        transmission,
        manufacturing_year,
        color,
        original_price,
        discounted_price,
        total_discount,
      });
    }
  }

  return entries;
}

export function pickBestOfferEntry(params: {
  entries: OfferEntry[];
  lockedModel?: string | null;
  lockedVariant?: string | null;
  lockedFuel?: string | null;
  lockedTransmission?: string | null;
  lockedYear?: string | null;
}): OfferEntry | null {
  const { entries } = params;
  if (!entries.length) return null;

  const m = normalizeForMatch(params.lockedModel || "");
  const v = normalizeForMatch(params.lockedVariant || "");
  const f = normalizeForMatch(params.lockedFuel || "");
  const tr = normalizeForMatch(params.lockedTransmission || "");
  const y = (params.lockedYear || "").trim();

  let best: { e: OfferEntry; score: number } | null = null;

  for (const e of entries) {
    let score = 0;

    const em = normalizeForMatch(e.model || "");
    const ev = normalizeForMatch(e.variant || "");
    const ef = normalizeForMatch(e.fuel || "");
    const et = normalizeForMatch(e.transmission || "");
    const ey = (e.manufacturing_year || "").trim();

    if (m && em.includes(m)) score += 6;
    if (v && ev.includes(v)) score += 10;

    if (f && ef.includes(f)) score += 2;
    if (tr && et.includes(tr)) score += 2;
    if (y && ey === y) score += 2;

    // Light preference for newer year if tie
    if (!y && ey) score += Number(ey) / 10_000;

    if (!best || score > best.score) best = { e, score };
  }

  return best?.e ?? null;
}

export function buildOfferReply(entry: OfferEntry): string {
  const bits: string[] = [];

  const headParts: string[] = [];
  if (entry.model) headParts.push(entry.model.trim());
  if (preventingRobotLikeHead(entry.variant))
    headParts.push(entry.variant.trim());

  const meta: string[] = [];
  if (entry.fuel) meta.push(entry.fuel.trim());
  if (entry.transmission) meta.push(entry.transmission.trim());
  if (entry.manufacturing_year)
    meta.push(`MY${entry.manufacturing_year.trim()}`);

  const metaText = meta.length ? ` (${meta.join(", ")})` : "";
  const head = `${headParts.join(" ")}${metaText}`.trim();

  const o = entry.original_price ? formatRupee(entry.original_price) : "";
  const d = entry.total_discount ? formatRupee(entry.total_discount) : "";
  const f = entry.discounted_price ? formatRupee(entry.discounted_price) : "";

  // If one of the three is missing but we can compute, do it deterministically (no guessing)
  const oN = normalizePriceToken(o);
  const fN = normalizePriceToken(f);
  const dN = normalizePriceToken(d);

  let original = o;
  let final = f;
  let discount = d;

  if ((!discount || !dN) && oN && fN) {
    const disc = (Number(oN) - Number(fN)).toString();
    discount = `₹${disc}`;
  }

  if ((!final || !fN) && oN && dN) {
    const fin = (Number(oN) - Number(dN)).toString();
    final = `₹${fin}`;
  }

  if ((!original || !oN) && fN && dN) {
    const org = (Number(fN) + Number(dN)).toString();
    original = `₹${org}`;
  }

  // Human-like, but complete
  if (head) bits.push(`${head} ✅`);
  if (final) bits.push(`Final Offer Ex-Showroom: ${final}`);
  if (original) bits.push(`Original Ex-Showroom: ${original}`);
  if (discount) bits.push(`Discount Amount: ${discount}`);

  // Soft next step (human)
  bits.push(
    `If you want, I can also check availability for this exact color/year.`
  );

  return bits.join("\n");
}

export function buildOfferListReply(params: {
  entries: OfferEntry[];
  model?: string | null;
}): string {
  const model = (params.model || "").trim();
  const modelNorm = normalizeForMatch(model);

  const filtered = modelNorm
    ? params.entries.filter((e) =>
        normalizeForMatch(e.model || "").includes(modelNorm)
      )
    : params.entries;

  if (!filtered.length) {
    // Be careful: "no offers" is rarely definitive. Use a softer fallback and offer a human follow-up.
    return model
      ? `I don’t have a confirmed stock-offer entry for ${model} in my system right now. A sales executive can quickly verify the latest discounts for you — want me to connect you?`
      : "I don’t have any confirmed stock-offer entries in my system right now. A sales executive can verify the latest discounts — want me to connect you?";
  }

  // Keep it human and scannable: show up to 6 variants, grouped by model when model not specified.
  const lines: string[] = [];
  if (modelNorm) {
    lines.push(`Yes — there are stock offers on these ${model} variants:`);
    for (const e of filtered.slice(0, 6)) {
      const final = e.discounted_price ? formatRupee(e.discounted_price) : "";
      const disc = e.total_discount ? formatRupee(e.total_discount) : "";
      const orig = e.original_price ? formatRupee(e.original_price) : "";
      const suffixBits: string[] = [];
      if (orig) suffixBits.push(`Original ${orig}`);
      if (disc) suffixBits.push(`Discount ${disc}`);
      if (final) suffixBits.push(`Offer Ex-Showroom ${final}`);
      const suffix = suffixBits.length ? ` — ${suffixBits.join(" | ")}` : "";
      lines.push(`• ${e.variant}${suffix}`);
    }
    lines.push(
      "Tell me the variant name and I’ll share the full breakup (original ex-showroom + discount + offer ex-showroom) from the offer list."
    );
    return lines.join("\n");
  }

  // No model specified: show a compact catalog grouped by model.
  lines.push(
    "Yes — currently the special stock offers are available on these variants (limited stock):"
  );
  const byModel = new Map<string, OfferEntry[]>();
  for (const e of filtered) {
    const k = (e.model || "Other").trim() || "Other";
    if (!byModel.has(k)) byModel.set(k, []);
    byModel.get(k)!.push(e);
  }

  const modelNames = [...byModel.keys()].sort((a, b) => a.localeCompare(b));
  for (const m of modelNames) {
    const list = byModel.get(m) || [];
    lines.push(`\n${m}:`);
    for (const e of list.slice(0, 4)) {
      const final = e.discounted_price ? formatRupee(e.discounted_price) : "";
      const disc = e.total_discount ? formatRupee(e.total_discount) : "";
      const orig = e.original_price ? formatRupee(e.original_price) : "";
      const suffixBits: string[] = [];
      if (orig) suffixBits.push(`Original ${orig}`);
      if (disc) suffixBits.push(`Discount ${disc}`);
      if (final) suffixBits.push(`Offer Ex-Showroom ${final}`);
      const suffix = suffixBits.length ? ` — ${suffixBits.join(" | ")}` : "";
      lines.push(`• ${e.variant}${suffix}`);
    }
    if (list.length > 4) lines.push(`• +${list.length - 4} more`);
  }

  lines.push(
    "\nWhich model are you checking? I’ll share the exact offer details for that one."
  );
  return lines.join("\n");
}

function _extractOnRoadLine(params: {
  text: string;
  model?: string | null;
  variant?: string | null;
}): string | null {
  const t = (params.text || "").replace(/\r/g, "");
  if (!t) return null;

  const modelNorm = normalizeForMatch(params.model || "");
  const variantNorm = normalizeForMatch(params.variant || "");

  const lines = t
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Prefer lines that mention on-road + model/variant
  let best: { line: string; score: number } | null = null;

  for (const line of lines) {
    if (!/on\s*-?\s*road/i.test(line) || !/(₹|rs\.?|inr)\s*\d/i.test(line))
      continue;

    const ln = normalizeForMatch(line);
    let score = 1;
    if (modelNorm && ln.includes(modelNorm)) score += 3;
    if (variantNorm && ln.includes(variantNorm)) score += 5;

    if (!best || score > best.score) best = { line, score };
  }

  return best?.line ?? null;
}

function _buildOnRoadReply(params: {
  model?: string | null;
  variant?: string | null;
  onRoadLine: string;
}): string {
  const head = [params.model, params.variant].filter(Boolean).join(" ").trim();
  const prefix = head ? `${head} – ` : "";
  // Keep the KB line intact for numbers, but wrap in a friendly sentence
  return `${prefix}${params.onRoadLine.trim()}\nIf you want, I can also share the breakup (RTO/insurance) if it’s mentioned for this variant.`;
}

// Small helper to prevent weird empty variant joins in TS string building
function preventingRobotLikeHead(variant: string): boolean {
  return Boolean((variant || "").trim());
}

/* ============================================================================
   PHASE 0 — PRICING SAFETY HELPERS (HARD BLOCKS)
============================================================================ */

export function answerLooksLikePricingOrOffer(text: string): boolean {
  return looksLikePricingOrOfferContext(text);
}

export function looksLikePricingOrOfferContext(text: string): boolean {
  const t = (text || "").toLowerCase();
  if (!t.trim()) return false;

  const keywords = [
    "₹",
    " rs",
    "inr",
    "price",
    "pricing",
    "on-road",
    "on road",
    "ex-showroom",
    "ex showroom",
    "discount",
    "offer",
    "emi",
    "down payment",
    "rto",
    "insurance",
    "booking",
    "finance",
  ];

  if (keywords.some((k) => t.includes(k))) return true;

  // Numeric patterns that often indicate price/discount (₹ 12,34,567 / 123456 / 40k etc.)
  const hasLargeNumber = /\b\d{5,}\b/.test(t) || /\b\d{1,2}\s?%\b/.test(t);
  const hasKNotation = /\b\d{1,3}\s?(k|lac|lakh|cr|crore)\b/.test(t);
  return hasLargeNumber || hasKNotation;
}

export function redactUserProvidedPricing(text: string): string {
  // PHASE 4 — Unverified facts firewall:
  // For pricing/offers intents, user-provided numbers are never authoritative.
  // We keep conversational structure but prevent the model from "learning" or repeating numeric claims.
  const original = text || "";
  let t = original;

  // Redact currency-like fragments
  t = t.replace(/₹\s*[0-9][0-9,\.\s]*/gi, "₹[REDACTED]");
  t = t.replace(/\b(rs\.?|inr)\s*[0-9][0-9,\.\s]*/gi, "$1 [REDACTED]");

  t = t.replace(/\b\d{2,}(?:[\d,\.]*\d)?\b/g, "[REDACTED_NUMBER]");
  t = t.replace(/\b\d{1,3}\s?(k|lac|lakh|cr|crore)\b/gi, "[REDACTED_AMOUNT]");

  t = t.replace(/\b\d+\b/g, "[REDACTED_NUMBER]");

  // If the message looks like a pricing/offer claim, explicitly tag it as unverified.
  const needsTag = looksLikePricingOrOfferContext(original) || t !== original;
  if (needsTag) {
    t = `[USER_UNVERIFIED_PRICING_CLAIM] ${t}`;
  }

  return t;
}
