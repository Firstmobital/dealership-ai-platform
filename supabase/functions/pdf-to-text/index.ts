// supabase/functions/pdf-to-text/index.ts
// FINAL — SAFE FOR DIGITAL PDFs + OCR FALLBACK (EDGE SAFE)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import OpenAI from "https://esm.sh/openai@4.47.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

/* --------------------------------------------------
   CORS
-------------------------------------------------- */
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

/* --------------------------------------------------
   ENV
-------------------------------------------------- */
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/* --------------------------------------------------
   HANDLER
-------------------------------------------------- */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  let bucket: string | null = null;
  let path: string | null = null;
  let organization_id: string | null = null;
  let article_id: string | null = null;

  try {
    ({ bucket, path, organization_id, article_id } = await req.json());

    if (!bucket || !path || !organization_id || !article_id) {
      return json(400, {
        error:
          "bucket, path, organization_id, article_id are required",
      });
    }

    // Phase 1: mark processing started
    await supabase
      .from("knowledge_articles")
      .update({ processing_status: "processing", processing_error: null })
      .eq("id", article_id)
      .eq("organization_id", organization_id);

    /* --------------------------------------------------
       1️⃣ Download PDF from Supabase Storage
    -------------------------------------------------- */
    const { data, error } = await supabase.storage
      .from(bucket)
      .download(path);

    if (error || !data) {
      throw new Error("Failed to download PDF");
    }

    const pdfBytes = new Uint8Array(await data.arrayBuffer());

    /* --------------------------------------------------
       2️⃣ Upload PDF to OpenAI (FILES API)
       ⚠️ THIS IS THE CRITICAL FIX
    -------------------------------------------------- */
    const uploadedFile = await openai.files.create({
      file: new Blob([pdfBytes], { type: "application/pdf" }),
      purpose: "assistants",
    });

    /* --------------------------------------------------
       3️⃣ TEXT EXTRACTION (DIGITAL PDFs)
       ✔ Used for brochures like Sierra
       ✔ Fast
       ✔ Low memory
    -------------------------------------------------- */
    const extractResp = await openai.responses.create({
      model: "gpt-4o-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_file", file_id: uploadedFile.id },
            {
              type: "input_text",
              text:
                "Extract all readable text from this PDF. Preserve headings and tables.",
            },
          ],
        },
      ],
    });

    let text = extractResp.output_text?.trim() ?? "";

    /* --------------------------------------------------
       4️⃣ OCR FALLBACK (SCANNED PDFs ONLY)
       ✔ Only triggered if text is basically empty
       ✔ Prevents memory explosion
    -------------------------------------------------- */
    if (text.length < 200) {
      console.warn("[pdf-to-text] Low text detected → OCR fallback");

      const ocrResp = await openai.responses.create({
        model: "gpt-4o-mini",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  "The previous PDF contained little or no extractable text. " +
                  "Assume this is a scanned document. Perform OCR and extract all readable text.",
              },
            ],
          },
        ],
      });

      text = ocrResp.output_text?.trim() ?? "";
    }

    if (!text) {
      throw new Error("No text could be extracted from this PDF");
    }

    /* --------------------------------------------------
       5️⃣ Save extracted text
    -------------------------------------------------- */
    const { error: updateErr } = await supabase
      .from("knowledge_articles")
      .update({
        content: text,
        source_type: "file",
        processing_status: "completed",
        processing_error: null,
        last_processed_at: new Date().toISOString(),
      })
      .eq("id", article_id)
      .eq("organization_id", organization_id);

    if (updateErr) {
      throw updateErr;
    }

    return json(200, {
      success: true,
      extracted_chars: text.length,
    });
  } catch (err: any) {
    // Phase 1: persist processing failure (best-effort)
    try {
      if (organization_id && article_id) {
        await supabase
          .from("knowledge_articles")
          .update({
            processing_status: "error",
            processing_error: String(err?.message ?? err),
            last_processed_at: new Date().toISOString(),
          })
          .eq("id", article_id)
          .eq("organization_id", organization_id);
      }
    } catch (_) {
      // ignore
    }

    console.error("[pdf-to-text] fatal", err);

    return json(500, {
      error: err?.message ?? "PDF extraction failed",
    });
  }
});