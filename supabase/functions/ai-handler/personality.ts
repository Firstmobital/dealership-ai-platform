import { supabase } from "./clients.ts";

/* ============================================================================
   BOT PERSONALITY (ORG → SUB-ORG OVERRIDE)
============================================================================ */
export async function loadBotPersonality(params: { organizationId: string }) {
  const { organizationId } = params;

  const { data } = await supabase
    .from("bot_personality")
    .select(
      "tone, language, short_responses, emoji_usage, gender_voice, greeting_message, fallback_message, business_context, dos, donts"
    )
    .eq("organization_id", organizationId)
    .maybeSingle();

  return (
    data ?? {
      tone: "Professional",
      language: "English",
      short_responses: true,
      emoji_usage: false,
      gender_voice: "Neutral",
      greeting_message: "",
      fallback_message:
        "I’m sorry, I don’t have enough information to answer that.",
      business_context: "",
      dos: "",
      donts: "",
    }
  );
}
