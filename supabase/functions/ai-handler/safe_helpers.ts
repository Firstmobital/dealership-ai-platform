import { INTERNAL_API_KEY, PROJECT_URL, SERVICE_ROLE_KEY } from "./env.ts";
import type { createLogger } from "./logging.ts";

/* ============================================================================
   SAFE HELPERS
============================================================================ */
export async function safeSupabase<T>(
  opName: string,
  logger: ReturnType<typeof createLogger>,
  fn: () => PromiseLike<{ data: T | null; error: any }>
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
  payload: any
): Promise<boolean> {
  try {
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

export function safeText(v: any): string {
  return typeof v === "string" ? v : "";
}
