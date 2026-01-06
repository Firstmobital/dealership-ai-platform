// supabase/functions/whatsapp-test-send/index.ts
// deno-lint-ignore-file no-explicit-any

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/* ============================================================
   ENV
============================================================ */
const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing PROJECT_URL or SERVICE_ROLE_KEY");
}

/* ============================================================
   PHONE NORMALIZATION (INDIA)
============================================================ */
function normalizePhoneToE164India(raw: string): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, "");

  if (/^\+91\d{10}$/.test(raw)) return raw;
  if (/^91\d{10}$/.test(d)) return `+${d}`;
  if (/^\d{10}$/.test(d)) return `+91${d}`;

  return null;
}

function waToFromE164(phone: string) {
  // "+91XXXXXXXXXX" → "91XXXXXXXXXX"
  return phone.replace(/^\+/, "");
}

/* ============================================================
   TYPES
============================================================ */
type TestSendBody =
  | {
      mode?: "text";
      organization_id: string;
      to: string;
      text: string;
    }
  | {
      mode: "template";
      organization_id: string;
      to: string;
      whatsapp_template_id: string;
      template_variables?: string[];
    };

/* ============================================================
   MAIN
============================================================ */
serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { "Content-Type": "application/json" } },
      );
    }

    const body = (await req.json()) as TestSendBody;

    const organizationId = body.organization_id?.trim();
    if (!organizationId) {
      return new Response(
        JSON.stringify({ error: "organization_id required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!body.to?.trim()) {
      return new Response(
        JSON.stringify({ error: "Phone number required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const phoneE164 = normalizePhoneToE164India(body.to);
    if (!phoneE164) {
      return new Response(
        JSON.stringify({ error: "Invalid phone number format" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    /* ======================================================
       TEXT MODE (DEFAULT)
    ======================================================= */
    if (!("mode" in body) || body.mode === "text") {
      if (!("text" in body) || !body.text?.trim()) {
        return new Response(
          JSON.stringify({ error: "text required" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      const res = await fetch(`${PROJECT_URL}/functions/v1/whatsapp-send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          organization_id: organizationId,
          to: waToFromE164(phoneE164),
          type: "text",
          text: body.text,
        }),
      });

      const result = await res.json().catch(() => ({}));

      if (!res.ok) {
        return new Response(
          JSON.stringify({
            error: "Failed to send text",
            details: result,
          }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          mode: "text",
          phone: phoneE164,
          meta: result,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    /* ======================================================
       TEMPLATE MODE
    ======================================================= */
    if (body.mode !== "template") {
      return new Response(
        JSON.stringify({ error: "Invalid mode for template send" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const res = await fetch(`${PROJECT_URL}/functions/v1/whatsapp-send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        organization_id: organizationId,
        to: waToFromE164(phoneE164),
        type: "template",
        template_name: body.whatsapp_template_id,
        template_language: "en", // resolved internally by whatsapp-send
        template_variables: body.template_variables ?? [],
      }),
    });

    const result = await res.json().catch(() => ({}));

    if (!res.ok) {
      return new Response(
        JSON.stringify({
          error: "Failed to send template test",
          details: result,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        mode: "template",
        phone: phoneE164,
        meta: result,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[whatsapp-test-send] fatal", e);
    return new Response(
      JSON.stringify({ error: "Internal Server Error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
