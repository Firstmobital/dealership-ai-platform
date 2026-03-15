
/// <reference path="./deno-ambient.d.ts" />



/* ============================================================================
   ENV
============================================================================ */
export const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
export const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
export const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
export const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;
export const OPERATIONAL_SUPABASE_URL = Deno.env.get("OPERATIONAL_SUPABASE_URL")!;
export const OPERATIONAL_SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("OPERATIONAL_SUPABASE_SERVICE_ROLE_KEY")!;
export const INTERNAL_API_KEY = Deno.env.get("INTERNAL_API_KEY") || "";
export const OPENAI_MODEL_FAST = Deno.env.get("OPENAI_MODEL_FAST") || "gpt-4o-mini";
export const OPENAI_MODEL_MAIN = Deno.env.get("OPENAI_MODEL_MAIN") || "gpt-4o";
export const GEMINI_MODEL_FAST =
  Deno.env.get("GEMINI_MODEL_FAST") || "gemini-1.5-flash";
export const GEMINI_MODEL_MAIN = Deno.env.get("GEMINI_MODEL_MAIN") || "gemini-1.5-pro";

export const AI_NO_REPLY_TOKEN = "<NO_REPLY>";

if (
  !PROJECT_URL ||
  !SERVICE_ROLE_KEY ||
  !OPERATIONAL_SUPABASE_URL ||
  !OPERATIONAL_SUPABASE_SERVICE_ROLE_KEY
) {
  console.error("[ai-handler] Missing env vars", {
    hasProjectUrl: !!PROJECT_URL,
    hasServiceRoleKey: !!SERVICE_ROLE_KEY,
    hasOperationalSupabaseUrl: !!OPERATIONAL_SUPABASE_URL,
    hasOperationalSupabaseServiceRoleKey: !!OPERATIONAL_SUPABASE_SERVICE_ROLE_KEY,
    hasOpenAI: !!OPENAI_API_KEY,
    hasGemini: !!GEMINI_API_KEY,
  });
}

export const KB_DISABLE_LEXICAL =
  (Deno.env.get("KB_DISABLE_LEXICAL") || "").toLowerCase() === "true";
