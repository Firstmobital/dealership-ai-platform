import { INTERNAL_API_KEY, PROJECT_URL, SERVICE_ROLE_KEY } from "./env.ts";
import type { createLogger } from "./logging.ts";

/* ============================================================================
   SAFE HELPERS
============================================================================ */
export async function safeSupabase<T>(
  opName: string,
  logger: ReturnType<typeof createLogger>,
  fn: () => PromiseLike<{ data: T | null; error: unknown }>
): Promise<T | null> {
  try {
    const { data, error } = await fn();
    if (error) {
      logger.error(`[supabase] ${opName} error`, { error });
      return null;
    }
    return data;
  } catch (err) {
    logger.error(`[supabase] ${opName} fatal`, { error: err });
    return null;
  }
}

export async function safeWhatsAppSend(
  logger: ReturnType<typeof createLogger>,
  payload: unknown
): Promise<boolean> {
  try {
    // Back-compat + provider schema normalization:
    // Provider expects `image_url` / `document_url` / `video_url` / `audio_url`.
    // Callers may still pass `media_url`.
    if (typeof payload === "object" && payload !== null) {
      const p = payload as Record<string, unknown>;
      const mediaUrl = typeof p.media_url === "string" && p.media_url.trim()
        ? p.media_url
        : null;

      if (p.type === "image" && !p.image_url && mediaUrl) {
        payload = { ...p, image_url: mediaUrl };
      } else if (p.type === "document" && !p.document_url && mediaUrl) {
        payload = { ...p, document_url: mediaUrl };
      } else if (p.type === "video" && !p.video_url && mediaUrl) {
        payload = { ...p, video_url: mediaUrl };
      } else if (p.type === "audio" && !p.audio_url && mediaUrl) {
        payload = { ...p, audio_url: mediaUrl };
      }
    }

    const res = await fetch(`${PROJECT_URL}/functions/v1/whatsapp-send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        ...(INTERNAL_API_KEY ? { "x-internal-api-key": INTERNAL_API_KEY } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "<body read error>");
      logger.error("[whatsapp-send] non-OK response", {
        status: res.status,
        body: text,
        payload,
      });
      return false;
    }

    return true;
  } catch (err) {
    logger.error("[whatsapp-send] fetch failed", { error: err, payload });
    return false;
  }
}

export function safeText(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// -----------------------------------------------------------------------------
// Duplicate outbound text protection (fail-open)
// -----------------------------------------------------------------------------

type SupabaseLike = {
  from(table: string): {
    select(columns: string): unknown;
  };
};

type SupabaseQueryLike = {
  eq: (col: string, v: unknown) => SupabaseQueryLike;
  order: (col: string, opts: { ascending: boolean }) => SupabaseQueryLike;
  limit: (n: number) => SupabaseQueryLike;
  maybeSingle: () => PromiseLike<{ data: unknown; error: unknown }>;
};

export async function shouldBlockDuplicateText(params: {
  supabase: SupabaseLike;
  organizationId: string;
  conversationId: string;
  text: string;
}): Promise<boolean> {
  const textNew = String(params.text || "").trim();
  if (!textNew) return false;

  try {
    const q = params.supabase
      .from("messages")
      .select("text, order_at, created_at") as unknown as SupabaseQueryLike;

    const { data, error } = await q
      .eq("organization_id", params.organizationId)
      .eq("conversation_id", params.conversationId)
      .eq("sender", "bot")
      .eq("message_type", "text")
      .order("order_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return false; // fail-open

    const row = data as { text?: unknown; order_at?: unknown; created_at?: unknown };

    const lastText = String(row.text ?? "").trim();
    if (!lastText) return false;

    if (lastText !== textNew) return false;

    const tsRaw = (row.order_at ?? row.created_at) as unknown;
    const lastTs = Date.parse(String(tsRaw ?? ""));
    if (Number.isNaN(lastTs)) return false;

    const ageMs = Date.now() - lastTs;
    if (ageMs < 0) return false;

    return ageMs <= 90_000;
  } catch {
    return false; // fail-open
  }
}
