// supabase/functions/pdf-to-text/index.ts
// SAFE: No native modules, no canvas, no pdfjs

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import OpenAI from "https://esm.sh/openai@4.47.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

/* ------------------------------------------------------------------
   CORS
------------------------------------------------------------------ */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const {
      bucket,
      path,
      organization_id,
      article_id,
      mime_type,
    } = await req.json();

    if (!bucket || !path || !organization_id || !article_id) {
      return json(400, {
        error: "Missing params: bucket, path, organization_id, article_id are required",
      });
    }

    // This function is ONLY for PDFs. Excel/CSV should use ai-generate-kb.
    if (mime_type && String(mime_type) !== "application/pdf") {
      return json(400, {
        error:
          "pdf-to-text only supports application/pdf. For Excel/CSV, call ai-generate-kb.",
      });
    }

    /* --------------------------------------------------
       1️⃣ Download PDF from storage
    -------------------------------------------------- */
    const { data, error } = await supabase.storage
      .from(bucket)
      .download(path);

    if (error || !data) {
      return json(500, { error: "Failed to download PDF" });
    }

    const pdfBytes = new Uint8Array(await data.arrayBuffer());

    /* --------------------------------------------------
       2️⃣ Send PDF to OpenAI for TEXT extraction
    -------------------------------------------------- */
    const file = await openai.files.create({
      file: new Blob([pdfBytes], { type: "application/pdf" }),
      purpose: "assistants",
    });

    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_file", file_id: file.id },
            {
              type: "input_text",
              text: "Extract all readable text from this PDF. Preserve headings.",
            },
          ],
        },
      ],
    });

    const text =
      response.output_text?.trim() ?? "";

    if (!text) {
      return json(422, { error: "No text extracted" });
    }

    /* --------------------------------------------------
       3️⃣ Save extracted text
    -------------------------------------------------- */
    const { error: updateErr } = await supabase
      .from("knowledge_articles")
      .update({
        content: text,
        source_type: "file",
      })
      .eq("id", article_id)
      .eq("organization_id", organization_id);

    if (updateErr) {
      return json(500, { error: "Failed to update knowledge_articles" });
    }

    return json(200, { success: true, text });
  } catch (err) {
    console.error("[pdf-to-text] fatal", err);
    return json(500, { error: "Internal error" });
  }
});
