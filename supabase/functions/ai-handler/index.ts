// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import OpenAI from "https://esm.sh/openai@4.47.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

// --- ENV VARS ---
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("PROJECT_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

// --- CLIENTS ---
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type AiHandlerBody = {
  conversation_id?: string;
  user_message?: string;
};

serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = (await req.json()) as AiHandlerBody;
    const conversation_id = body.conversation_id;
    const user_message_raw = body.user_message;

    if (!conversation_id || !user_message_raw) {
      return new Response(
        JSON.stringify({
          error: "Missing conversation_id or user_message",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const user_message = user_message_raw.trim();
    if (!user_message) {
      return new Response(
        JSON.stringify({
          error: "Empty user_message",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // ------------------------------------------------------------------
    // 1) Load conversation (org + channel + contact)
    // ------------------------------------------------------------------
    const {
      data: conversation,
      error: convError,
    } = await supabase
      .from("conversations")
      .select("id, organization_id, channel, contact_id")
      .eq("id", conversation_id)
      .maybeSingle();

    if (convError) {
      console.error("[ai-handler] Error loading conversation:", convError);
      throw convError;
    }

    if (!conversation) {
      return new Response(
        JSON.stringify({ error: "Conversation not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    const organizationId: string = conversation.organization_id;
    const channel: string = (conversation as any).channel || "web";
    const contactId: string | null = (conversation as any).contact_id ?? null;

    // For WhatsApp replies we need the contact's phone
    let contactPhone: string | null = null;

    if (channel === "whatsapp" && contactId) {
      const { data: contact, error: contactError } = await supabase
        .from("contacts")
        .select("phone")
        .eq("id", contactId)
        .maybeSingle();

      if (contactError) {
        console.error("[ai-handler] Error loading contact:", contactError);
      } else if (contact?.phone) {
        contactPhone = contact.phone;
      }
    }

    // ------------------------------------------------------------------
    // 2) Load bot personality & instructions
    // ------------------------------------------------------------------
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
      personality?.fallback_message ||
      "I'm sorry, I do not have enough dealership information to answer that.";

    const personaBlock = [
      personality?.tone ? `- Tone: ${personality.tone}` : null,
      personality?.language ? `- Language: ${personality.language}` : null,
      personality?.short_responses
        ? "- Keep responses concise and focused (short_responses = true)."
        : "- You may use normal length responses when needed.",
      personality?.emoji_usage
        ? "- You may occasionally use relevant emojis."
        : "- Avoid using emojis.",
      personality?.gender_voice
        ? `- Voice: ${personality.gender_voice}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    const extraRules = extraInstructions?.rules
      ? JSON.stringify(extraInstructions.rules)
      : "";

    // ------------------------------------------------------------------
    // 3) Load conversation history (last ~20 messages)
    // ------------------------------------------------------------------
    const { data: recentMessages, error: historyError } = await supabase
      .from("messages")
      .select("sender, message_type, text, created_at")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: true })
      .limit(20);

    if (historyError) {
      console.error("[ai-handler] Error loading message history:", historyError);
    }

    let historyText = "";
    if (recentMessages && recentMessages.length > 0) {
      historyText = recentMessages
        .map((m) => {
          const role =
            m.sender === "bot"
              ? "Bot"
              : m.sender === "customer"
              ? "Customer"
              : "User";
          const ts = (m as any).created_at
            ? new Date((m as any).created_at as string).toISOString()
            : "";
          const content = m.text || "";
          return `${ts} - ${role}: ${content}`;
        })
        .join("\n");
    }

    // ------------------------------------------------------------------
    // 4) Send typing indicator for WhatsApp BEFORE heavy work
    // ------------------------------------------------------------------
    if (channel === "whatsapp" && contactPhone) {
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            organization_id: organizationId,
            to: contactPhone,
            type: "typing_on",
          }),
        });
      } catch (typingError) {
        console.error("[ai-handler] typing_on error:", typingError);
      }
    }

    // ------------------------------------------------------------------
    // 5) RAG: embedding + knowledge_chunks match
    // ------------------------------------------------------------------
    let contextText = "No matching dealership knowledge found.";

    try {
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: user_message,
      });

      const embedding = embeddingResponse.data?.[0]?.embedding;
      if (embedding && Array.isArray(embedding)) {
        const { data: matches, error: matchError } = await supabase.rpc(
          "match_knowledge_chunks",
          {
            query_embedding: embedding,
            match_count: 20,
            match_threshold: 0.3,
          },
        );

        if (matchError) {
          console.error("[ai-handler] RAG match error:", matchError);
        } else if (matches && matches.length > 0) {
          const articleIds = [
            ...new Set((matches as any[]).map((m) => m.article_id).filter(Boolean)),
          ];

          if (articleIds.length > 0) {
            const { data: articles, error: articlesError } = await supabase
              .from("knowledge_articles")
              .select("id, organization_id")
              .in("id", articleIds);

            if (articlesError) {
              console.error(
                "[ai-handler] Error loading knowledge_articles:",
                articlesError,
              );
            } else {
              const allowedIds = new Set(
                (articles || [])
                  .filter((a) => a.organization_id === organizationId)
                  .map((a) => a.id),
              );

              const filtered = (matches as any[]).filter((m) =>
                allowedIds.has(m.article_id)
              );

              if (filtered.length > 0) {
                contextText = filtered
                  .map(
                    (m) =>
                      `- ${m.chunk} (relevance: ${Number(m.similarity).toFixed(
                        2,
                      )})`,
                  )
                  .join("\n");
              }
            }
          }
        }
      }
    } catch (ragError) {
      console.error("[ai-handler] Error during embedding/RAG:", ragError);
    }

    // ------------------------------------------------------------------
    // 6) Build system prompt (persona + channel style + context)
    // ------------------------------------------------------------------
    const channelRules =
      channel === "whatsapp"
        ? `
WHATSAPP STYLE RULES:
- Keep answers short, friendly, and easy to read on mobile.
- Use short paragraphs and bullet points.
- Avoid long walls of text.
- If you mention prices, clearly say they are approximate and can change.
        `.trim()
        : `
WEB/DEFAULT STYLE RULES:
- You may use normal paragraph lengths but stay concise.
- Structure answers with headings and bullet points when useful.
        `.trim();

    const systemPrompt = `
You are a helpful AI showroom assistant for an automotive dealership.

ORGANIZATION:
- Organization ID: ${organizationId}
- Channel: ${channel}

BOT PERSONALITY:
${personaBlock || "- Use a neutral, polite tone."}

ADDITIONAL RULES (JSON from bot_instructions, may be empty):
${extraRules || "{}"}

DEALERSHIP KNOWLEDGE CONTEXT:
${contextText}

RECENT CONVERSATION HISTORY:
${historyText || "No previous messages."}

RESPONSE GUIDELINES:
- Answer the user's latest question or message clearly.
- Use only trustworthy information. Prefer the DEALERSHIP KNOWLEDGE CONTEXT when available.
- If specific prices/discounts are not present in the context, speak only in approximate ranges and clearly state they can vary.
- Do NOT invent exact on-road prices, insurance, RTO, or discounts if not in context.
- If you genuinely cannot answer from the context and reasonable domain knowledge, reply EXACTLY with:
"${fallbackMessage}"

${channelRules}
`.trim();

    // ------------------------------------------------------------------
    // 7) Call OpenAI
    // ------------------------------------------------------------------
    let aiResponseText = fallbackMessage;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: user_message },
        ],
        temperature: 0.2,
      });

      const content = completion.choices?.[0]?.message?.content?.trim();
      if (content) {
        aiResponseText = content;
      }
    } catch (llmError) {
      console.error("[ai-handler] OpenAI error:", llmError);
      // aiResponseText remains fallbackMessage
    }

    // ------------------------------------------------------------------
    // 8) Channel-specific behavior
    // ------------------------------------------------------------------

    // ⭐ Web / internal channel:
    // - Just return ai_response (frontend will insert DB message)
    if (channel !== "whatsapp") {
      const payload = {
        conversation_id,
        user_message,
        ai_response: aiResponseText,
      };

      return new Response(JSON.stringify(payload), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // ⭐ WhatsApp channel:
    // - Insert bot message in DB
    // - Update last_message_at
    // - Send WA reply via whatsapp-send
    try {
      const { error: botMsgError } = await supabase.from("messages").insert({
        conversation_id,
        sender: "bot",
        message_type: "text",
        text: aiResponseText,
        media_url: null,
        channel: "whatsapp",
      });

      if (botMsgError) {
        console.error("[ai-handler] Error inserting bot message:", botMsgError);
      }

      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", conversation_id);
    } catch (dbError) {
      console.error("[ai-handler] Error inserting/updating DB:", dbError);
    }

    if (contactPhone) {
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            organization_id: organizationId,
            to: contactPhone,
            type: "text",
            text: aiResponseText,
          }),
        });
      } catch (waError) {
        console.error("[ai-handler] Error calling whatsapp-send:", waError);
      }
    } else {
      console.warn(
        "[ai-handler] No contact phone found for WhatsApp reply, skipping outbound",
      );
    }

    // Still return ai_response for logging/debug
    const payload = {
      conversation_id,
      user_message,
      ai_response: aiResponseText,
    };

    return new Response(JSON.stringify(payload), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[ai-handler] Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: err?.message ?? "Internal Server Error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
