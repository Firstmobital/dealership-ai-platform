// supabase/functions/pdf-to-text/index.ts
// SAFE: OpenAI file-based extraction + OCR fallback + progress tracking

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

/* ------------------------------------------------------------------
   ENV
------------------------------------------------------------------ */
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/* ------------------------------------------------------------------
   HELPERS
------------------------------------------------------------------ */
async function updateProgress(
  article_id: string,
  organization_id: string,
  status: string,
  error: string | null = null
) {
  await supabase
    .from("knowledge_articles")
    .update({
      processing_status: status,
      processing_error: error,
      last_processed_at:
        status === "completed" || status === "failed"
          ? new Date().toISOString()
          : null,
    })
    .eq("id", article_id)
    .eq("organization_id", organization_id);
}

/* ------------------------------------------------------------------
   MAIN
------------------------------------------------------------------ */
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
        error:
          "Missing params: bucket, path, organization_id, article_id are required",
      });
    }

    if (mime_type && String(mime_type) !== "application/pdf") {
      return json(400, {
        error:
          "pdf-to-text only supports application/pdf. For Excel/CSV, call ai-generate-kb.",
      });
    }

    // 🔄 Mark processing started
    await updateProgress(article_id, organization_id, "extracting_text");

    /* --------------------------------------------------
       1️⃣ Download PDF
    -------------------------------------------------- */
    const { data, error } = await supabase.storage
      .from(bucket)
      .download(path);

    if (error || !data) {
      await updateProgress(
        article_id,
        organization_id,
        "failed",
        "Failed to download PDF"
      );
      return json(500, { error: "Failed to download PDF" });
    }

    const pdfBytes = new Uint8Array(await data.arrayBuffer());

    /* --------------------------------------------------
       2️⃣ Upload PDF to OpenAI
    -------------------------------------------------- */
    const uploadedFile = await openai.files.create({
      file: new Blob([pdfBytes], { type: "application/pdf" }),
      purpose: "assistants",
    });

    /* --------------------------------------------------
       3️⃣ TEXT EXTRACTION (PASS 1)
    -------------------------------------------------- */
    let extractedText = "";

    const textResponse = await openai.responses.create({
      model: "gpt-4.1-mini",
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

    extractedText = textResponse.output_text?.trim() ?? "";

    /* --------------------------------------------------
       4️⃣ OCR FALLBACK (SCANNED PDF)
    -------------------------------------------------- */
    if (extractedText.length < 200) {
      await updateProgress(article_id, organization_id, "ocr_fallback");

      const ocrResponse = await openai.responses.create({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "user",
            content: [
              { type: "input_file", file_id: uploadedFile.id },
              {
                type: "input_text",
                text:
                  "This PDF may be scanned. Perform OCR and extract ALL visible text accurately.",
              },
            ],
          },
        ],
      });

      extractedText = ocrResponse.output_text?.trim() ?? "";
    }

    if (!extractedText || extractedText.length < 50) {
      await updateProgress(
        article_id,
        organization_id,
        "failed",
        "No readable text found (even after OCR)"
      );
      return json(422, { error: "No readable text extracted" });
    }

    /* --------------------------------------------------
       5️⃣ Save extracted text
    -------------------------------------------------- */
    await updateProgress(article_id, organization_id, "saving");

    const { error: updateErr } = await supabase
      .from("knowledge_articles")
      .update({
        content: extractedText,
        source_type: "file",
        processing_status: "completed",
        processing_error: null,
        last_processed_at: new Date().toISOString(),
      })
      .eq("id", article_id)
      .eq("organization_id", organization_id);

    if (updateErr) {
      await updateProgress(
        article_id,
        organization_id,
        "failed",
        "Failed to save extracted text"
      );
      return json(500, { error: "Failed to update knowledge_articles" });
    }

    return json(200, {
      success: true,
      chars: extractedText.length,
      ocr_used: extractedText.length < 500,
    });
  } catch (err: any) {
    console.error("[pdf-to-text] fatal", err);
    return json(500, { error: err?.message ?? "Internal error" });
  }
});
