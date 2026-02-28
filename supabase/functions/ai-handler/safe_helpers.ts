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
