// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import OpenAI from "https://esm.sh/openai@4.47.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

// ------------------------------------------------------------------
// ENV VARIABLES
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
// HELPERS (Stage 5E)
// ------------------------------------------------------------------
async function logUnansweredQuestion(organizationId: string, question: string) {
  const q = question.trim();
  if (!q) return;

  try {
    const { data: existing } = await supabase
      .from("unanswered_questions")
      .select("id, occurrences")
      .eq("organization_id", organizationId)
      .eq("question", q)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("unanswered_questions")
        .update({ occurrences: (existing.occurrences ?? 0) + 1 })
        .eq("id", existing.id);
    } else {
      await supabase.from("unanswered_questions").insert({
        organization_id: organizationId,
        question: q,
        occurrences: 1,
      });
    }
  } catch (err) {
    console.error("[ai-handler] logUnansweredQuestion error:", err);
  }
}

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
    const body = (await req.json()) as {
      conversation_id?: string;
      user_message?: string;
    };

    const conversation_id = body.conversation_id;
    const raw_message = body.user_message;

    if (!conversation_id || !raw_message) {
      return new Response(
        JSON.stringify({ error: "Missing conversation_id or user_message" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const user_message = raw_message.trim();
    if (!user_message) {
      return new Response(
        JSON.stringify({ error: "Empty user_message" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // --------------------------------------------------------------
    // 1) Load conversation (NOW INCLUDES ai_enabled)
    // --------------------------------------------------------------
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select(
        "id, organization_id, channel, contact_id, sub_organization_id, ai_enabled"
      )
      .eq("id", conversation_id)
      .maybeSingle();

    if (convError) throw convError;
    if (!conversation) {
      return new Response(
        JSON.stringify({ error: "Conversation not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const organizationId = conversation.organization_id;
    const channel = conversation.channel || "web";
    const contactId = conversation.contact_id;
    const subOrganizationId = conversation.sub_organization_id ?? null;

    // --------------------------------------------------------------
    // NEW — Stage 5E: Respect AI toggle
    // --------------------------------------------------------------
    if (conversation.ai_enabled === false) {
      return new Response(
        JSON.stringify({
          skipped: true,
          reason: "AI disabled for this conversation",
          conversation_id,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // --------------------------------------------------------------
    // 2) Fetch contact phone for WhatsApp outbound
    // --------------------------------------------------------------
    let contactPhone: string | null = null;

    if (channel === "whatsapp" && contactId) {
      const { data: contact } = await supabase
        .from("contacts")
        .select("phone")
        .eq("id", contactId)
        .maybeSingle();
      contactPhone = contact?.phone ?? null;
    }

    // --------------------------------------------------------------
    // 3) Load bot personality + instructions
    // --------------------------------------------------------------
    let personality: any = null;

    if (subOrganizationId) {
      const { data } = await supabase
        .from("bot_personality")
        .select("*")
        .eq("organization_id", organizationId)
        .or(
          `sub_organization_id.eq.${subOrganizationId},sub_organization_id.is.null`
        )
        .order("sub_organization_id", { ascending: false })
        .limit(1)
        .maybeSingle();
      personality = data;
    } else {
      const { data } = await supabase
        .from("bot_personality")
        .select("*")
        .eq("organization_id", organizationId)
        .is("sub_organization_id", null)
        .maybeSingle();
      personality = data;
    }

    let extraInstructions: any = null;

    if (subOrganizationId) {
      const { data } = await supabase
        .from("bot_instructions")
        .select("rules")
        .eq("organization_id", organizationId)
        .or(
          `sub_organization_id.eq.${subOrganizationId},sub_organization_id.is.null`
        )
        .order("sub_organization_id", { ascending: false })
        .limit(1)
        .maybeSingle();
      extraInstructions = data;
    } else {
      const { data } = await supabase
        .from("bot_instructions")
        .select("rules")
        .eq("organization_id", organizationId)
        .is("sub_organization_id", null)
        .maybeSingle();
      extraInstructions = data;
    }

    const fallbackMessage =
      personality?.fallback_message ??
      "I'm sorry, I do not have enough dealership information to answer that.";

    const personaBlock = [
      subOrganizationId &&
        `- Division / Department ID: ${subOrganizationId}`,
      personality?.tone && `- Tone: ${personality.tone}`,
      personality?.language && `- Language: ${personality.language}`,
      personality?.short_responses
        ? "- Responses should be concise."
        : "- Normal-length responses allowed.",
      personality?.emoji_usage
        ? "- You may add emojis."
        : "- Avoid emojis.",
      personality?.gender_voice && `- Voice style: ${personality.gender_voice}`,
    ]
      .filter(Boolean)
      .join("\n");

    const extraRules = extraInstructions?.rules
      ? JSON.stringify(extraInstructions.rules)
      : "{}";

    // --------------------------------------------------------------
    // 4) Load conversation history
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

          return `${new Date(m.created_at).toISOString()} - ${role}: ${m.text}`;
        })
        .join("\n") ?? "No previous messages.";

    // --------------------------------------------------------------
    // 5) Send typing indicator (WhatsApp only)
    // --------------------------------------------------------------
    if (channel === "whatsapp" && contactPhone) {
      fetch(`${PROJECT_URL}/functions/v1/whatsapp-send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          organization_id: organizationId,
          to: contactPhone,
          type: "typing_on",
          sub_organization_id: subOrganizationId,
        }),
      }).catch(console.error);
    }
    
    // --------------------------------------------------------------
    // 6) RAG Pipeline (Stage 4+)
    // --------------------------------------------------------------
    let contextText = "No matching dealership knowledge found.";

    try {
      // Use the same embedding model as ingestion for dimension consistency
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-large",
        input: user_message,
      });

      const embedding = embeddingResponse.data?.[0]?.embedding as
        | number[]
        | undefined;

      if (embedding) {
        const { data: matches, error: matchError } = await supabase.rpc(
          "match_knowledge_chunks",
          {
            query_embedding: embedding,
            match_count: 20,
            match_threshold: 0.3,
          }
        );

        if (matchError) {
          console.error("[ai-handler] match_knowledge_chunks error:", matchError);
        } else if (matches?.length) {
          // Collect all article IDs from matches
          const articleIds = [
            ...new Set(matches.map((m: any) => m.article_id)),
          ];

          // Fetch articles to enforce org + sub-org scoping
          const { data: articles, error: articlesError } = await supabase
            .from("knowledge_articles")
            .select("id, organization_id, sub_organization_id")
            .in("id", articleIds);

          if (articlesError) {
            console.error(
              "[ai-handler] knowledge_articles lookup error:",
              articlesError
            );
          } else if (articles && articles.length > 0) {
            const allowedIds = new Set(
              articles
                .filter((a: any) => {
                  if (a.organization_id !== organizationId) return false;

                  // If conversation has no sub-org: only allow org-level (sub_org null)
                  if (!subOrganizationId) {
                    return a.sub_organization_id === null;
                  }

                  // If conversation has a sub-org:
                  //  - allow org-level (null)
                  //  - OR that exact sub-org
                  return (
                    a.sub_organization_id === null ||
                    a.sub_organization_id === subOrganizationId
                  );
                })
                .map((a: any) => a.id)
            );

            const filtered = matches.filter((m: any) =>
              allowedIds.has(m.article_id)
            );

            if (filtered.length > 0) {
              contextText = filtered
                .map(
                  (m: any) =>
                    `- ${m.chunk} (score: ${Number(m.similarity).toFixed(2)})`
                )
                .join("\n");
            }
          }
        }
      }
    } catch (err) {
      console.error("[ai-handler] RAG error:", err);
    }

    // --------------------------------------------------------------
    // 7) System Prompt
    // --------------------------------------------------------------
    const channelRules =
      channel === "whatsapp"
        ? "Keep answers short, easy, bullet points preferred."
        : "Use structured paragraphs.";

    const systemPrompt = `
You are an AI showroom assistant for an automotive dealership.

ORGANIZATION:
- Org ID: ${organizationId}
- Channel: ${channel}
${
  subOrganizationId
    ? `- Division: ${subOrganizationId}`
    : `- Division: general`
}

PERSONALITY:
${personaBlock}

BOT RULES:
${extraRules}

KNOWLEDGE CONTEXT:
${contextText}

RECENT HISTORY:
${historyText}

RESPOND TO USER:
- Answer ONLY the latest user message
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
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: user_message },
        ],
      });

      const content = resp.choices?.[0]?.message?.content?.trim();
      if (content) aiResponseText = content;
    } catch (err) {
      console.error("[ai-handler] OpenAI error:", err);
    }

    // --------------------------------------------------------------
    // Stage 5E — Log unanswered questions
    // --------------------------------------------------------------
    if (aiResponseText === fallbackMessage) {
      await logUnansweredQuestion(organizationId, user_message);
    }

    // --------------------------------------------------------------
    // 9) OUTPUT (Web)
    // --------------------------------------------------------------
    if (channel !== "whatsapp") {
      await supabase.from("messages").insert({
        conversation_id,
        sender: "bot",
        message_type: "text",
        text: aiResponseText,
        media_url: null,
        channel: "web",
        sub_organization_id: subOrganizationId,
      });

      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", conversation_id);

      return new Response(
        JSON.stringify({ conversation_id, ai_response: aiResponseText }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // --------------------------------------------------------------
    // 10) OUTPUT (WhatsApp)
    // --------------------------------------------------------------
    await supabase.from("messages").insert({
      conversation_id,
      sender: "bot",
      message_type: "text",
      text: aiResponseText,
      media_url: null,
      channel: "whatsapp",
      sub_organization_id: subOrganizationId,
    });

    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversation_id);

    if (contactPhone) {
      fetch(`${PROJECT_URL}/functions/v1/whatsapp-send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          organization_id: organizationId,
          sub_organization_id: subOrganizationId,
          to: contactPhone,
          type: "text",
          text: aiResponseText,
        }),
      }).catch(console.error);
    }

    return new Response(
      JSON.stringify({
        conversation_id,
        ai_response: aiResponseText,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[ai-handler] Fatal error:", err);
    return new Response(
      JSON.stringify({
        error: err?.message ?? "Internal Server Error",
      }),
      { status: 500 }
    );
  }
});
