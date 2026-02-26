/* ============================================================================
   LOGGING
============================================================================ */
export type LogContext = {
  request_id: string;
  conversation_id?: string;
  organization_id?: string;
  channel?: string;
};

export function createLogger(ctx: LogContext) {
  const base = {
    request_id: ctx.request_id,
    conversation_id: ctx.conversation_id,
    organization_id: ctx.organization_id,
    channel: ctx.channel,
  };

  return {
    info(message: string, extra: Record<string, any> = {}) {
      console.log(
        JSON.stringify({ level: "info", message, ...base, ...extra })
      );
    },
    warn(message: string, extra: Record<string, any> = {}) {
      console.warn(
        JSON.stringify({ level: "warn", message, ...base, ...extra })
      );
    },
    error(message: string, extra: Record<string, any> = {}) {
      console.error(
        JSON.stringify({ level: "error", message, ...base, ...extra })
      );
    },
    debug(message: string, extra: Record<string, any> = {}) {
      console.log(
        JSON.stringify({ level: "debug", message, ...base, ...extra })
      );
    },
  };
}

export type KBScoredRow = {
  id: string;
  article_id: string;
  title: string;
  chunk: string;
  similarity?: number; // undefined for lexical-only
  rank?: number; // keep lexical signal for debugging / confidence
  score: number;
  keywords?: string[]; // knowledge_articles.keywords (optional)
};

