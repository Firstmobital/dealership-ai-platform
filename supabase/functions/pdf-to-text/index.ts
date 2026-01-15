// supabase/functions/pdf-to-text/index.ts
// SAFE: No native modules, no canvas, no pdfjs

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import OpenAI from "https://esm.sh/openai@4.47.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

serve(async (req) => {
  try {
    const {
      bucket,
      path,
      organization_id,
      article_id,
    } = await req.json();

    if (!bucket || !path || !organization_id) {
      return new Response("Missing params", { status: 400 });
    }

    /* --------------------------------------------------
       1️⃣ Download PDF from storage
    -------------------------------------------------- */
    const { data, error } = await supabase.storage
      .from(bucket)
      .download(path);

    if (error || !data) {
      return new Response("Failed to download PDF", { status: 500 });
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
      return new Response("No text extracted", { status: 422 });
    }

    /* --------------------------------------------------
       3️⃣ Save extracted text
    -------------------------------------------------- */
    await supabase
      .from("knowledge_articles")
      .update({
        content: text,
        source_type: "file",
      })
      .eq("id", article_id)
      .eq("organization_id", organization_id);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[pdf-to-text] fatal", err);
    return new Response("Internal error", { status: 500 });
  }
});
