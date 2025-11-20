// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import OpenAI from "https://esm.sh/openai@4.47.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

// ------------------------------------------------------------------
// ENV VARIABLES (YOUR CHOSEN STANDARD)
// ------------------------------------------------------------------
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

// ------------------------------------------------------------------
// CLIENTS
// ------------------------------------------------------------------
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ------------------------------------------------------------------
// REQUEST BODY TYPE
// ------------------------------------------------------------------
type AiHandlerBody = {
  conversation_id?: string;
  user_message?: string;
};

// ==================================================================
// MAIN HANDLER
// ==================================================================
serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // --------------------------------------------------------------
    // 0) Parse body
    // --------------------------------------------------------------
    const body = (await req.json()) as AiHandlerBody;

    const conversation_id = body.conversation_id;
    const raw_message = body.user_message;

    if (!conversation_id || !raw_message) {
      return new Response(
        JSON.stringify({ error: "Missing conversation_id or user_message" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const user_message = raw_message.trim();
    if (!user_message) {
      return new Response(
        JSON.stringify({ error: "Empty user_message" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // --------------------------------------------------------------
    // 1) Load conversation
    // --------------------------------------------------------------
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("id, organization_id, channel, contact_id")
      .eq("id", conversation_id)
      .maybeSingle();

    if (convError) throw convError;
    if (!conversation) {
      return new Response(
        JSON.stringify({ error: "Conversation not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    const organizationId = conversation.organization_id;
    const channel = conversation.channel || "web";
    const contactId = conversation.contact_id ?? null;

    // --------------------------------------------------------------
    // 2) If WhatsApp → fetch customer phone
    // --------------------------------------------------------------
    let contactPhone: string | null = null;

    if (channel === "whatsapp" && contactId) {
      const { data: contact } = await supabase
        .from("contacts")
        .select("phone")
        .eq("id", contactId)
        .maybeSingle();

      if (contact?.phone) {
        contactPhone = contact.phone;
      }
    }

    // --------------------------------------------------------------
    // 3) Load bot personality & additional rules
    // --------------------------------------------------------------
    const { data: personality } = await supabase
      .from("bot_personality")
      .select("*")
      .eq("organization_id", organizationId)
      .maybeSingle();

    const { data: extraInstructions } = await supabase
      .from("bot_instructions")
      .select("rules")
      .eq("organization_id", organizationId)
      .maybeSingle();

    const fallbackMessage =
      personality?.fallback_message ??
      "I'm sorry, I do not have enough dealership information to answer that.";

    const personaBlock = [
      personality?.tone && `- Tone: ${personality.tone}`,
      personality?.language && `- Language: ${personality.language}`,
      personality?.short_responses
        ? "- Responses should be concise (short_responses = true)."
        : "- Normal-length responses allowed.",
      personality?.emoji_usage
        ? "- You may add relevant emojis."
        : "- Avoid emojis.",
      personality?.gender_voice && `- Voice style: ${personality.gender_voice}`,
    ]
      .filter(Boolean)
      .join("\n");

    const extraRules = extraInstructions?.rules
      ? JSON.stringify(extraInstructions.rules)
      : "{}";

    // --------------------------------------------------------------
    // 4) Load last 20 messages
    // --------------------------------------------------------------
    const { data: recentMessages } = await supabase
      .from("messages")
      .select("sender, message_type, text, created_at")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: true })
      .limit(20);

    const historyText =
      recentMessages
        ?.map((m) => {
          const role =
            m.sender === "bot"
              ? "Bot"
              : m.sender === "customer"
              ? "Customer"
              : "User";

          const ts = m.created_at
            ? new Date(m.created_at).toISOString()
            : "";

          return `${ts} - ${role}: ${m.text ?? ""}`;
        })
        .join("\n") || "No previous messages.";

    // --------------------------------------------------------------
    // 5) Send typing indicator (WhatsApp only)
    // --------------------------------------------------------------
    if (channel === "whatsapp" && contactPhone) {
      try {
        await fetch(`${PROJECT_URL}/functions/v1/whatsapp-send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            organization_id: organizationId,
            to: contactPhone,
            type: "typing_on",
          }),
        });
      } catch (err) {
        console.error("[ai-handler] typing_on error:", err);
      }
    }

    // --------------------------------------------------------------
    // 6) RAG: Embedding + chunk similarity match
    // --------------------------------------------------------------
    let contextText = "No matching dealership knowledge found.";

    try {
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: user_message,
      });

      const embedding = embeddingResponse.data?.[0]?.embedding;

      if (embedding) {
        const { data: matches } = await supabase.rpc(
          "match_knowledge_chunks",
          {
            query_embedding: embedding,
            match_count: 20,
            match_threshold: 0.3,
          },
        );

        if (matches?.length) {
          const articleIds = [
            ...new Set(matches.map((m: any) => m.article_id)),
          ];

          const { data: articles } = await supabase
            .from("knowledge_articles")
            .select("id, organization_id")
            .in("id", articleIds);

          const allowed = new Set(
            (articles || [])
              .filter((a) => a.organization_id === organizationId)
              .map((a) => a.id),
          );

          const filtered = matches.filter((m: any) =>
            allowed.has(m.article_id)
          );

          if (filtered.length > 0) {
            contextText = filtered
              .map(
                (m: any) =>
                  `- ${m.chunk} (relevance: ${Number(m.similarity).toFixed(
                    2,
                  )})`,
              )
              .join("\n");
          }
        }
      }
    } catch (err) {
      console.error("[ai-handler] RAG error:", err);
    }

    // --------------------------------------------------------------
    // 7) Build system prompt
    // --------------------------------------------------------------
    const channelRules =
      channel === "whatsapp"
        ? `
WHATSAPP RULES:
- Keep answers short and readable.
- Use bullet points and small paragraphs.
- Avoid long walls of text.
- Mention that prices are approximate and may vary.
      `.trim()
        : `
WEB RULES:
- Use normal paragraphs and structured formatting.
      `.trim();

    const systemPrompt = `
You are an AI showroom assistant for an automotive dealership.

ORGANIZATION:
- Organization ID: ${organizationId}
- Channel: ${channel}

PERSONALITY:
${personaBlock}

ADDITIONAL RULES (from bot_instructions):
${extraRules}

KNOWLEDGE CONTEXT:
${contextText}

RECENT HISTORY:
${historyText}

RESPONSE RULES:
- Answer the user's latest message.
- Prefer dealership knowledge context.
- If unsure → reply EXACTLY: "${fallbackMessage}"
${channelRules}
`.trim();

    // --------------------------------------------------------------
    // 8) Call OpenAI
    // --------------------------------------------------------------
    let aiResponseText = fallbackMessage;
    try {
      const resp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: user_message },
        ],
        temperature: 0.2,
      });

      const content = resp.choices?.[0]?.message?.content?.trim();
      if (content) aiResponseText = content;
    } catch (err) {
      console.error("[ai-handler] OpenAI error:", err);
    }

    // --------------------------------------------------------------
    // 9) Web response (no outbound)
    // --------------------------------------------------------------
    if (channel !== "whatsapp") {
      return new Response(
        JSON.stringify({
          conversation_id,
          user_message,
          ai_response: aiResponseText,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // --------------------------------------------------------------
    // 10) WhatsApp channel: insert DB + send outbound
    // --------------------------------------------------------------
    try {
      await supabase.from("messages").insert({
        conversation_id,
        sender: "bot",
        message_type: "text",
        text: aiResponseText,
        media_url: null,
        channel: "whatsapp",
      });

      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", conversation_id);
    } catch (err) {
      console.error("[ai-handler] DB insert error:", err);
    }

    if (contactPhone) {
      try {
        await fetch(`${PROJECT_URL}/functions/v1/whatsapp-send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            organization_id: organizationId,
            to: contactPhone,
            type: "text",
            text: aiResponseText,
          }),
        });
      } catch (err) {
        console.error("[ai-handler] Outbound WA error:", err);
      }
    }

    return new Response(
      JSON.stringify({
        conversation_id,
        user_message,
        ai_response: aiResponseText,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[ai-handler] Fatal error:", err);
    return new Response(
      JSON.stringify({ error: err?.message || "Internal Server Error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
