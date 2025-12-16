// supabase/functions/contact-bulk-upload/index.ts
// deno-lint-ignore-file no-explicit-any

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY);

/* ---------------------------
   Helpers
----------------------------*/
function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 10) return null;
  return `+91${digits}`;
}

/* ---------------------------
   Handler
----------------------------*/
serve(async (req) => {
  try {
    const {
      organization_id,
      rows,
      label, // optional tag
    } = await req.json();

    if (!organization_id || !Array.isArray(rows)) {
      return new Response("Invalid payload", { status: 400 });
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      const phone = normalizePhone(row.phone);
      if (!phone) {
        skipped++;
        continue;
      }

      const { data: existing } = await supabase
        .from("contacts")
        .select("*")
        .eq("organization_id", organization_id)
        .eq("phone", phone)
        .maybeSingle();

      // ------------------
      // INSERT
      // ------------------
      if (!existing) {
        await supabase.from("contacts").insert({
          organization_id,
          phone,
          first_name: row.first_name ?? null,
          last_name: row.last_name ?? null,
          model: row.model ?? null,
          labels: label ? { [label]: true } : null,
        });
        inserted++;
        continue;
      }

      // ------------------
      // UPDATE (SAFE ENRICH ONLY)
      // ------------------
      const updatePayload: any = {};

      if (!existing.first_name && row.first_name)
        updatePayload.first_name = row.first_name;

      if (!existing.last_name && row.last_name)
        updatePayload.last_name = row.last_name;

      if (!existing.model && row.model)
        updatePayload.model = row.model;

      if (label) {
        updatePayload.labels = {
          ...(existing.labels || {}),
          [label]: true,
        };
      }

      if (Object.keys(updatePayload).length > 0) {
        await supabase
          .from("contacts")
          .update(updatePayload)
          .eq("id", existing.id);
        updated++;
      } else {
        skipped++;
      }
    }

    return new Response(
      JSON.stringify({ inserted, updated, skipped }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[contact-bulk-upload]", err);
    return new Response("Upload failed", { status: 500 });
  }
});
