// supabase/functions/ai-handler/media_assets.ts
// Read-only helpers for org-scoped media asset retrieval + signed URL generation.
// No env reads. No DB writes.

import { normalizeVehicleModelToken, normalizeTextKey } from "./model_normalize.ts";

export type MediaAsset = {
  id: string;
  organization_id: string;
  asset_type: "image" | "brochure";
  model: string | null;
  variant: string | null;
  title: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string | null;
  filename: string | null;
  is_active: boolean;
};

export type Logger = {
  info?: (message: string, extra?: Record<string, unknown>) => void;
  warn?: (message: string, extra?: Record<string, unknown>) => void;
  error?: (message: string, extra?: Record<string, unknown>) => void;
};

const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

// NOTE: We intentionally treat Supabase client as `any` here to avoid
// TS generic mismatches across different Supabase client instantiations.
// This module is read-only and validates its outputs at runtime.

type SupabaseQueryAny = {
  eq: (column: string, value: unknown) => SupabaseQueryAny;
  ilike: (column: string, pattern: string) => SupabaseQueryAny;
  in: (column: string, values: string[]) => SupabaseQueryAny;
  limit: (count: number) => Promise<{ data: unknown[] | null; error: unknown | null }>;
};

type SupabaseAny = {
  from: (table: string) => {
    select: (columns: string) => SupabaseQueryAny;
  };
  storage: {
    from: (bucket: string) => {
      createSignedUrl: (
        path: string,
        ttlSeconds: number,
      ) => Promise<{ data: { signedUrl: string } | null; error: unknown | null }>;
    };
  };
};

function escapeForLike(input: string): string {
  // Escape characters meaningful to SQL LIKE/ILIKE patterns.
  // Supabase JS uses PostgREST which supports escaping via backslash.
  return input.replace(/([%_\\])/g, "\\$1");
}

// Internal helpers
function normalizeToken(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .trim()
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[.,!?;:()\[\]{}"'`~@#$^&*+=|<>/\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForLike(s: string): string {
  const normalized = normalizeToken(s);
  return escapeForLike(normalized);
}

function getErrorMeta(err: unknown): Record<string, unknown> {
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    return {
      message: typeof e.message === "string" ? e.message : undefined,
      details: e.details,
      hint: e.hint,
      code: e.code,
    };
  }
  return { message: String(err) };
}

export function userWantsMedia(
  userText: string,
): { wantImages: boolean; wantBrochure: boolean } {
  const text = normalizeToken(userText);

  const imageKeywords = [
    "photo",
    "photos",
    "pic",
    "pics",
    "image",
    "images",
    "pictures",
    "send pics",
    "car pics",
  ];

  const brochureKeywords = [
    "brochure",
    "brochures",
    "pdf",
    "catalog",
    "catalogue",
    "send brochure",
    "share brochure",
    "send pdf",
  ];

  const wantImages = imageKeywords.some((k) => text.includes(k));
  const wantBrochure = brochureKeywords.some((k) => text.includes(k));

  return { wantImages, wantBrochure };
}

function isNonEmpty(s: string | null | undefined): s is string {
  return typeof s === "string" && s.trim().length > 0;
}

function normalizeAssetModelForMatch(assetModelRaw: string | null): string | null {
  if (!assetModelRaw) return null;

  // Allow values like:
  // - "Xpres-T"
  // - "Xpres T"
  // - "Xpres-T Brochure"
  // - "Xpres T EV"
  // Keep deterministic and narrow: strip a few known suffix keywords.
  const t = normalizeTextKey(assetModelRaw)
    .replace(/\b(brochure|brochures|pdf|catalog|catalogue)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalizeVehicleModelToken(t);
}

function scoreAsset(
  asset: MediaAsset,
  normalizedModel: string,
  normalizedVariant: string | null,
): number {
  // Prefer canonical model match first; fall back to existing token heuristics.
  const assetModelCanonical = normalizeAssetModelForMatch(asset.model);
  const assetModel = normalizeToken(asset.model ?? "");
  const assetVariant = normalizeToken(asset.variant ?? "");

  let score = 0;

  if (assetModelCanonical && assetModelCanonical === normalizedModel) {
    score += 20;
  } else {
    if (assetModel === normalizedModel) score += 10;
    else if (assetModel.includes(normalizedModel) || normalizedModel.includes(assetModel)) score += 6;
  }

  if (normalizedVariant) {
    if (assetVariant === normalizedVariant) score += 5;
    else if (
      assetVariant.includes(normalizedVariant) ||
      normalizedVariant.includes(assetVariant)
    ) {
      score += 2;
    }
  }

  if (asset.is_active) score += 1;
  return score;
}

function isMediaAssetRow(row: unknown): row is MediaAsset {
  if (!row || typeof row !== "object") return false;
  const r = row as Record<string, unknown>;
  return typeof r.id === "string" &&
    typeof r.organization_id === "string" &&
    (r.asset_type === "image" || r.asset_type === "brochure") &&
    typeof r.title === "string" &&
    typeof r.storage_bucket === "string" &&
    typeof r.storage_path === "string" &&
    typeof r.is_active === "boolean";
}

export async function fetchMediaAssets(params: {
  supabase: unknown;
  organizationId: string;
  model: string | null;
  variant: string | null;
  wantImages: boolean;
  wantBrochure: boolean;
  logger?: Logger;
}): Promise<{ images: MediaAsset[]; brochures: MediaAsset[] }> {
  const logger = params.logger ?? noopLogger;

  const supabase = params.supabase as unknown as SupabaseAny;

  if (!params.wantImages && !params.wantBrochure) return { images: [], brochures: [] };
  if (!isNonEmpty(params.model)) return { images: [], brochures: [] };

  // Request-side model is expected to be canonical already (main_handler normalizes),
  // but re-normalize defensively.
  const normalizedModel = normalizeVehicleModelToken(params.model) ?? normalizeToken(params.model);
  const normalizedVariant = isNonEmpty(params.variant) ? normalizeToken(params.variant) : null;

  let q = supabase
    .from("media_assets")
    .select(
      "id, organization_id, asset_type, model, variant, title, storage_bucket, storage_path, mime_type, filename, is_active",
    )
    .eq("organization_id", params.organizationId)
    .eq("is_active", true);

  if (params.wantImages && !params.wantBrochure) q = q.eq("asset_type", "image");
  else if (!params.wantImages && params.wantBrochure) q = q.eq("asset_type", "brochure");
  else q = q.in("asset_type", ["image", "brochure"]);

  // Keep the DB-side filter broad to avoid missing bad stored values; do final match in memory.
  // Prefer a wide, deterministic prefix/term search rather than exact matching.
  const modelLike = normalizeForLike(params.model);
  q = q.ilike("model", `%${modelLike}%`);

  let data: unknown[] | null = null;
  try {
    const res = await q.limit(50);
    data = res.data;
    if (res.error) {
      logger?.warn?.("fetchMediaAssets: supabase error", getErrorMeta(res.error));
      return { images: [], brochures: [] };
    }
  } catch (e) {
    logger?.error?.("fetchMediaAssets: unexpected error", getErrorMeta(e));
    return { images: [], brochures: [] };
  }

  const rowsUnknown = Array.isArray(data) ? data : [];
  const rows: MediaAsset[] = rowsUnknown.filter(isMediaAssetRow);

  // Runtime-normalized model matching against canonical request model.
  const matched = rows
    .filter((r) => r.organization_id === params.organizationId && r.is_active)
    .filter((r) => {
      const canon = normalizeAssetModelForMatch(r.model);
      if (canon) return canon === normalizedModel;

      // Fallback: if cannot canonicalize, keep legacy token match.
      const legacy = normalizeToken(r.model ?? "");
      return legacy === normalizedModel || legacy.includes(normalizedModel) || normalizedModel.includes(legacy);
    });

  const ranked = matched
    .map((r) => ({ r, score: scoreAsset(r, normalizedModel, normalizedVariant) }))
    .sort((a, b) => b.score - a.score);

  const images: MediaAsset[] = [];
  const brochures: MediaAsset[] = [];

  for (const { r } of ranked) {
    if (r.asset_type === "image" && params.wantImages) images.push(r);
    if (r.asset_type === "brochure" && params.wantBrochure) brochures.push(r);
  }

  return {
    images: images.slice(0, 3),
    brochures: brochures.slice(0, 1),
  };
}

export function pickAssetsForSend(assets: {
  images: MediaAsset[];
  brochures: MediaAsset[];
}): { images: MediaAsset[]; brochure: MediaAsset | null } {
  const images = Array.isArray(assets.images) ? assets.images.slice(0, 3) : [];
  const brochure = Array.isArray(assets.brochures) && assets.brochures.length > 0
    ? assets.brochures[0]
    : null;
  return { images, brochure };
}

export async function signMediaUrl(params: {
  supabase: unknown;
  bucket: string;
  path: string;
  ttlSeconds: number;
  logger?: Logger;
}): Promise<string | null> {
  const logger = params.logger ?? noopLogger;

  const supabase = params.supabase as unknown as SupabaseAny;

  try {
    const { data, error } = await supabase.storage
      .from(params.bucket)
      .createSignedUrl(params.path, params.ttlSeconds);

    if (error) {
      logger?.warn?.("signMediaUrl: supabase error", getErrorMeta(error));
      return null;
    }

    return data?.signedUrl ?? null;
  } catch (e) {
    logger?.error?.("signMediaUrl: unexpected error", getErrorMeta(e));
    return null;
  }
}

export const __test__ = {
  normalizeAssetModelForMatch,
};
