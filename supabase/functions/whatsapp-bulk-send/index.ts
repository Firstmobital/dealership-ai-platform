// supabase/functions/whatsapp-bulk-send/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN")!;
const PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")!;
const API_URL = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;

serve(async (req) => {
  try {
    const { phones, template, params } = await req.json();

    if (!phones || !Array.isArray(phones)) {
      return new Response("Invalid phones array", { status: 400 });
    }

    const results = [];

    for (const phone of phones) {
      const payload = {
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: template,
          language: { code: "en_IN" },
          components: [
            {
              type: "body",
              parameters: params.map((text: string) => ({
                type: "text",
                text,
              })),
            },
          ],
        },
      };

      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      results.push({
        phone,
        success: res.ok,
        response: data,
      });
    }

    return new Response(JSON.stringify({ results }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response("Internal error", { status: 500 });
  }
});
