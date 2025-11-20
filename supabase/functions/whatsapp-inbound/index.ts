// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

// ENV
const SUPABASE_URL = Deno.env.get("_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPP_MEDIA_BUCKET = "whatsapp-media";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

/* -------------------------------------------------------------------------- */
/*  VERIFY WEBHOOK (GET)                                                     */
/* -------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------- */
/*  HELPER: Update campaign counters                                         */
/* -------------------------------------------------------------------------- */
async function recomputeCampaignCounters(campaignId: string) {
  try {
    // Count sent/delivered
    const { count: sentCount, error: sentErr } = await supabase
      .from("campaign_messages")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .in("status", ["sent", "delivered"]);

    if (sentErr) {
      console.error("[whatsapp-status] sentCount error:", sentErr);
    }

    // Count failed
    const { count: failedCount, error: failErr } = await supabase
      .from("campaign_messages")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", "failed");

    if (failErr) {
      console.error("[whatsapp-status] failedCount error:", failErr);
    }

    const safeSent = sentCount ?? 0;
    const safeFailed = failedCount ?? 0;

    const { error: updateErr } = await supabase
      .from("campaigns")
      .update({
        sent_count: safeSent,
        failed_count: safeFailed,
      })
      .eq("id", campaignId);

    if (updateErr) {
      console.error("[whatsapp-status] campaign counter update error:", updateErr);
    }
  } catch (e) {
    console.error("[whatsapp-status] recompute counters fatal:", e);
  }
}

/* -------------------------------------------------------------------------- */
/*  HELPER: Handle STATUS webhooks (delivery reports)                         */
/* -------------------------------------------------------------------------- */
async function handleStatuses(statuses: any[]) {
  for (const st of statuses) {
    try {
      const waMessageId: string | undefined = st.id;
      const waStatus: string | undefined = st.status; // "sent", "delivered", "read", "failed", etc.
      const timestamp: string | undefined = st.timestamp; // unix seconds
      const errorText: string | undefined = st.errors?.[0]?.message;

      if (!waMessageId || !waStatus) continue;

      // Find matching campaign_message by whatsapp_message_id
      const { data: cm, error: cmError } = await supabase
        .from("campaign_messages")
        .select("id, campaign_id, status")
        .eq("whatsapp_message_id", waMessageId)
        .maybeSingle();

      if (cmError) {
        console.error("[whatsapp-status] lookup error:", cmError);
        continue;
      }

      if (!cm) {
        // Status might belong to a non-campaign WhatsApp message; ignore
        continue;
      }

      // Map WABA status → our enum
      let newStatus: "sent" | "delivered" | "failed" | null = null;

      if (waStatus === "sent") {
        newStatus = "sent";
      } else if (waStatus === "delivered" || waStatus === "read") {
        // treat "read" as delivered for now
        newStatus = "delivered";
      } else if (waStatus === "failed") {
        newStatus = "failed";
      }

      if (!newStatus) {
        // ignore other statuses like "deleted"
        continue;
      }

      const updates: Record<string, any> = { status: newStatus };

      if (newStatus === "delivered" && timestamp) {
        const tsMs = Number(timestamp) * 1000;
        if (!Number.isNaN(tsMs)) {
          updates.delivered_at = new Date(tsMs).toISOString();
        }
      }

      if (newStatus === "failed" && errorText) {
        updates.error = errorText.slice(0, 1000);
      }

      const { error: updateError } = await supabase
        .from("campaign_messages")
        .update(updates)
        .eq("id", cm.id);

      if (updateError) {
        console.error("[whatsapp-status] update message error:", updateError);
        continue;
      }

      // Recompute campaign counters
      await recomputeCampaignCounters(cm.campaign_id);
    } catch (err) {
      console.error("[whatsapp-status] unhandled status error:", err);
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  MAIN HANDLER                                                              */
/* -------------------------------------------------------------------------- */
serve(async (req) => {
  try {
    if (req.method === "GET") return verifyWebhook(req);
    if (req.method !== "POST") {
      return new Response("Not allowed", { status: 405 });
    }

    const body = await req.json();
    console.log("[whatsapp-inbound] BODY:", JSON.stringify(body));

    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    const messages = value?.messages ?? [];
    const statuses = value?.statuses ?? [];

    const hasMessages = Array.isArray(messages) && messages.length > 0;
    const hasStatuses = Array.isArray(statuses) && statuses.length > 0;

    // -----------------------------------------
    // 1) Handle STATUS updates (delivery, etc.)
    // -----------------------------------------
    if (hasStatuses) {
      console.log(
        "[whatsapp-inbound] Received statuses:",
        JSON.stringify(statuses)
      );
      await handleStatuses(statuses);
    }

    // If there are no messages (only statuses), we're done.
    if (!hasMessages) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // -----------------------------------------
    // 2) Normal INBOUND MESSAGE flow (existing)
    // -----------------------------------------
    const waMessage = messages[0];
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

          const contentType =
            fileRes.headers.get("content-type") || "application/octet-stream";
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
