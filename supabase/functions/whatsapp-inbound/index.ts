// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

// --- ENV VARS ---
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// --- SUPABASE CLIENT ---
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Helpers
async function verifyWebhook(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  console.log("[WhatsApp] Verify request:", { mode, token, challenge });

  if (mode !== "subscribe" || !token || !challenge) {
    return new Response("Invalid verify request", { status: 400 });
  }

  // Look up the verify_token in whatsapp_settings
  const { data, error } = await supabase
    .from("whatsapp_settings")
    .select("id")
    .eq("verify_token", token)
    .maybeSingle();

  if (error) {
    console.error("[WhatsApp] Error checking verify_token:", error);
    return new Response("Server error", { status: 500 });
  }

  if (!data) {
    console.warn("[WhatsApp] Verify token not found:", token);
    return new Response("Forbidden", { status: 403 });
  }

  // Meta expects the challenge as plain text
  return new Response(challenge, { status: 200 });
}

serve(async (req) => {
  try {
    if (req.method === "GET") {
      // Meta verification handshake
      return await verifyWebhook(req);
    }

    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const body = (await req.json()) as any;
    console.log("[WhatsApp] Incoming payload:", JSON.stringify(body));

    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    if (!value || !value.metadata) {
      console.warn("[WhatsApp] No value/metadata in payload");
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const phoneNumberId: string | undefined = value.metadata.phone_number_id;
    if (!phoneNumberId) {
      console.error("[WhatsApp] Missing phone_number_id in metadata");
      return new Response("Missing phone_number_id", { status: 400 });
    }

    const waMessage = value.messages?.[0];
    if (!waMessage) {
      console.log("[WhatsApp] No messages array, nothing to do");
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Extract contact info
    const contact = value.contacts?.[0];
    const waId: string = waMessage.from || contact?.wa_id;
    const customerPhone: string = contact?.wa_id || waMessage.from;
    const customerName: string | null = contact?.profile?.name ?? null;

    // Extract message text (handle basic text + interactive text)
    let incomingText: string | null = null;
    if (waMessage.type === "text") {
      incomingText = waMessage.text?.body ?? null;
    } else if (waMessage.type === "button") {
      incomingText = waMessage.button?.text ?? null;
    } else if (waMessage.type === "interactive") {
      // Basic support for interactive replies
      const interactive = waMessage.interactive;
      incomingText =
        interactive?.button_reply?.title ??
        interactive?.list_reply?.title ??
        null;
    }

    incomingText = incomingText?.trim() || null;

    if (!customerPhone || !incomingText) {
      console.warn("[WhatsApp] Missing customer phone or text", {
        customerPhone,
        incomingText,
      });
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Look up WhatsApp settings by phone_number_id
    const { data: waSettings, error: settingsError } = await supabase
      .from("whatsapp_settings")
      .select(
        "id, organization_id, api_token, whatsapp_phone_id, whatsapp_business_id"
      )
      .eq("whatsapp_phone_id", phoneNumberId)
      .maybeSingle();

    if (settingsError) {
      console.error("[WhatsApp] Error loading whatsapp_settings:", settingsError);
      return new Response("Server error", { status: 500 });
    }

    if (!waSettings) {
      console.error(
        "[WhatsApp] No whatsapp_settings row for phone_number_id",
        phoneNumberId,
      );
      return new Response("No settings for this phone_number_id", {
        status: 404,
      });
    }

    const organizationId: string = waSettings.organization_id;
    const apiToken: string = waSettings.api_token;

    // --------------------------------------------------------------------
    // 1) Find or create CONTACT
    // --------------------------------------------------------------------
    const { data: existingContact, error: contactError } = await supabase
      .from("contacts")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("phone", customerPhone)
      .maybeSingle();

    if (contactError) {
      console.error("[WhatsApp] Error querying contacts:", contactError);
      return new Response("Server error", { status: 500 });
    }

    let contactId: string;

    if (!existingContact) {
      const { data: newContact, error: insertContactError } = await supabase
        .from("contacts")
        .insert({
          organization_id: organizationId,
          phone: customerPhone,
          name: customerName,
        })
        .select("*")
        .single();

      if (insertContactError || !newContact) {
        console.error("[WhatsApp] Error inserting contact:", insertContactError);
        return new Response("Server error", { status: 500 });
      }

      contactId = newContact.id;
    } else {
      contactId = existingContact.id;
    }

    // --------------------------------------------------------------------
    // 2) Find or create CONVERSATION for this contact
    // --------------------------------------------------------------------
    const { data: existingConversation, error: convError } = await supabase
      .from("conversations")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (convError) {
      console.error(
        "[WhatsApp] Error querying conversations:",
        convError,
      );
      return new Response("Server error", { status: 500 });
    }

    const nowIso = new Date().toISOString();
    let conversationId: string;

    if (!existingConversation) {
      const { data: newConversation, error: insertConvError } = await supabase
        .from("conversations")
        .insert({
          organization_id: organizationId,
          contact_id: contactId,
          ai_enabled: true,
          last_message_at: nowIso,
        })
        .select("*")
        .single();

      if (insertConvError || !newConversation) {
        console.error(
          "[WhatsApp] Error inserting conversation:",
          insertConvError,
        );
        return new Response("Server error", { status: 500 });
      }

      conversationId = newConversation.id;
    } else {
      conversationId = existingConversation.id;

      // Update last_message_at for existing conversation
      await supabase
        .from("conversations")
        .update({ last_message_at: nowIso })
        .eq("id", conversationId);
    }

    // --------------------------------------------------------------------
    // 3) Insert CUSTOMER message into messages table
    // --------------------------------------------------------------------
    const messageType: string = waMessage.type || "text";

    const { error: userMsgError } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender: "customer",
      message_type: messageType,
      text: incomingText,
      media_url: null,
    });

    if (userMsgError) {
      console.error("[WhatsApp] Error inserting customer message:", userMsgError);
      // Still return success so WhatsApp doesn't retry, but log for fixing.
    }

    // --------------------------------------------------------------------
    // 4) Always call ai-handler for WhatsApp (auto-AI enabled)
    // --------------------------------------------------------------------
    let aiText: string | null = null;

    try {
      const aiResponse = await fetch(`${SUPABASE_URL}/functions/v1/ai-handler`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          user_message: incomingText,
        }),
      });

      if (!aiResponse.ok) {
        console.error(
          "[WhatsApp] ai-handler HTTP error:",
          aiResponse.status,
          await aiResponse.text(),
        );
      } else {
        const aiJson = await aiResponse.json();
        aiText =
          (aiJson as any)?.ai_response ??
          (aiJson as any)?.response ??
          null;

        if (!aiText) {
          console.warn(
            "[WhatsApp] ai-handler returned no ai_response",
            aiJson,
          );
        }
      }
    } catch (err) {
      console.error("[WhatsApp] Error calling ai-handler:", err);
    }

    // --------------------------------------------------------------------
    // 5) Insert BOT reply into messages + update conversation
    // --------------------------------------------------------------------
    if (aiText) {
      const { data: botMessage, error: botError } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender: "bot",
          message_type: "text",
          text: aiText,
          media_url: null,
        })
        .select("*")
        .single();

      if (botError) {
        console.error("[WhatsApp] Error inserting bot message:", botError);
      } else if (botMessage?.created_at) {
        await supabase
          .from("conversations")
          .update({ last_message_at: botMessage.created_at })
          .eq("id", conversationId);
      }
    }

    // --------------------------------------------------------------------
    // 6) Send BOT reply back to WhatsApp (if we have aiText)
    // --------------------------------------------------------------------
    if (aiText) {
      try {
        const graphUrl = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;

        const wRes = await fetch(graphUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiToken}`,
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: waId || customerPhone,
            type: "text",
            text: { body: aiText },
          }),
        });

        const wJson = await wRes.text();
        console.log("[WhatsApp] Send message response:", wRes.status, wJson);
      } catch (err) {
        console.error("[WhatsApp] Error sending message to WhatsApp:", err);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[WhatsApp] Unhandled error:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
});
