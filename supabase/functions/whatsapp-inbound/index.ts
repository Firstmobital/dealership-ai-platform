// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

// ENV
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPP_MEDIA_BUCKET = "whatsapp-media";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// VERIFICATION HANDLER
async function verifyWebhook(req: Request): Promise<Response> {
  const url = new URL(req.url);

  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (!mode || !token) {
    return new Response("Missing hub.mode or verify_token", { status: 400 });
  }

  // Find any org where verify_token matches
  const { data: settings } = await supabase
    .from("whatsapp_settings")
    .select("verify_token")
    .eq("verify_token", token)
    .maybeSingle();

  if (!settings) return new Response("Invalid verify_token", { status: 403 });

  if (mode === "subscribe") {
    return new Response(challenge ?? "", { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

// MAIN
serve(async (req) => {
  try {
    if (req.method === "GET") return verifyWebhook(req);
    if (req.method !== "POST") return new Response("Not allowed", { status: 405 });

    const body = await req.json();
    console.log("[whatsapp-inbound] BODY:", JSON.stringify(body));

    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    if (!value?.messages) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const waMessage = value.messages[0];
    const contact = value.contacts?.[0];

    const phoneNumberId = value.metadata?.phone_number_id;
    if (!phoneNumberId) {
      console.error("[whatsapp-inbound] Missing phone_number_id");
      return new Response("Missing phone_number_id", { status: 400 });
    }

    // Load org using phone_number_id
    const { data: waSettings } = await supabase
      .from("whatsapp_settings")
      .select("organization_id, api_token")
      .eq("whatsapp_phone_id", phoneNumberId)
      .maybeSingle();

    if (!waSettings) {
      console.error("[whatsapp-inbound] Unknown phone_number_id:", phoneNumberId);
      return new Response("Unknown phone_number_id", { status: 400 });
    }

    const organizationId = waSettings.organization_id;
    const apiToken = waSettings.api_token;

    // Get customer identity
    const customerPhone = contact?.wa_id || waMessage.from;
    const customerName = contact?.profile?.name ?? null;
    const messageType = waMessage.type || "text";

    // Extract text (if any)
    let text: string | null = null;
    if (messageType === "text") text = waMessage.text?.body ?? null;
    if (messageType === "button") text = waMessage.button?.text ?? null;
    if (messageType === "interactive") {
      const it = waMessage.interactive;
      text = it?.button_reply?.title ?? it?.list_reply?.title ?? null;
    }
    if (messageType === "image") text = waMessage.image?.caption ?? null;
    if (messageType === "document") {
      text = waMessage.document?.caption ?? waMessage.document?.filename ?? null;
    }

    // Ensure text or media exists
    const isMedia = messageType === "image" || messageType === "document";
    if (!text && !isMedia) {
      text = null;
    }

    // ---------------------------
    // CONTACT UPSERT
    // ---------------------------
    const { data: existingContact } = await supabase
      .from("contacts")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("phone", customerPhone)
      .maybeSingle();

    let contactId: string;

    if (!existingContact) {
      const { data: inserted } = await supabase
        .from("contacts")
        .insert({
          organization_id: organizationId,
          phone: customerPhone,
          name: customerName,
        })
        .select()
        .single();

      contactId = inserted.id;
    } else {
      contactId = existingContact.id;

      // Update name if changed
      if (customerName && existingContact.name !== customerName) {
        await supabase
          .from("contacts")
          .update({ name: customerName })
          .eq("id", contactId);
      }
    }

    // ---------------------------
    // CONVERSATION UPSERT
    // ---------------------------
    const { data: existingConv } = await supabase
      .from("conversations")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("contact_id", contactId)
      .eq("channel", "whatsapp")
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let conversationId: string;

    if (!existingConv) {
      const { data: insertedConv } = await supabase
        .from("conversations")
        .insert({
          organization_id: organizationId,
          contact_id: contactId,
          ai_enabled: true,
          channel: "whatsapp",
          last_message_at: new Date().toISOString(),
        })
        .select()
        .single();

      conversationId = insertedConv.id;
    } else {
      conversationId = existingConv.id;
      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", conversationId);
    }

    // ---------------------------
    // PROCESS MEDIA (if any)
    // ---------------------------
    let mediaUrl: string | null = null;

    if (isMedia) {
      try {
        const mediaId =
          messageType === "image" ? waMessage.image?.id : waMessage.document?.id;

        if (mediaId) {
          // 1) Get WhatsApp media URL (signed)
          const metaRes = await fetch(
            `https://graph.facebook.com/v20.0/${mediaId}`,
            {
              headers: { Authorization: `Bearer ${apiToken}` },
            }
          );

          const meta = await metaRes.json();
          const downloadUrl = meta.url;

          // 2) Download binary file
          const fileRes = await fetch(downloadUrl, {
            headers: { Authorization: `Bearer ${apiToken}` },
          });

          const contentType = fileRes.headers.get("content-type") || "application/octet-stream";
          const fileBytes = new Uint8Array(await fileRes.arrayBuffer());

          // 3) Upload to Supabase Storage
          const ext =
            messageType === "image"
              ? "jpg"
              : (waMessage.document?.filename?.split(".").pop() ?? "pdf");

          const path = `org_${organizationId}/${conversationId}/${mediaId}.${ext}`;

          const { data: uploaded } = await supabase.storage
            .from(WHATSAPP_MEDIA_BUCKET)
            .upload(path, fileBytes, {
              contentType,
              upsert: true,
            });

          if (uploaded) {
            const { data: pubUrl } = supabase.storage
              .from(WHATSAPP_MEDIA_BUCKET)
              .getPublicUrl(uploaded.path);

            mediaUrl = pubUrl.publicUrl;
          }
        }
      } catch (err) {
        console.error("[whatsapp-inbound] Media error:", err);
      }
    }

    // ---------------------------
    // INSERT CUSTOMER MESSAGE
    // ---------------------------
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender: "customer",
      message_type: messageType,
      text: text,
      media_url: mediaUrl,
      channel: "whatsapp",
    });

    // ---------------------------
    // CALL AI HANDLER
    // Channel = WhatsApp → ai-handler will send reply via whatsapp-send
    // ---------------------------
    await fetch(`${SUPABASE_URL}/functions/v1/ai-handler`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        conversation_id: conversationId,
        user_message:
          text ??
          (messageType === "image"
            ? "Customer sent an image"
            : "Customer sent a document"),
      }),
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[whatsapp-inbound] ERROR:", err);
    return new Response("Internal Error", { status: 500 });
  }
});
