// supabase/functions/contact-bulk-upload/index.ts
// deno-lint-ignore-file no-explicit-any

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

/* ============================================================
   ENV
============================================================ */
const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing PROJECT_URL or SERVICE_ROLE_KEY");
}

const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY);

/* ============================================================
   HELPERS
============================================================ */

/**
 * Normalize phone numbers to E.164 (India default)
 */
function normalizePhoneToE164India(raw: string): string | null {
  if (!raw) return null;

  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/\D/g, "");

  // +91XXXXXXXXXX
  if (trimmed.startsWith("+") && digits.length === 12 && digits.startsWith("91")) {
    return `+${digits}`;
  }

  // 91XXXXXXXXXX
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+${digits}`;
  }

  // XXXXXXXXXX
  if (digits.length === 10) {
    return `+91${digits}`;
  }

  // 0XXXXXXXXXX
  if (digits.length === 11 && digits.startsWith("0")) {
    return `+91${digits.slice(1)}`;
  }

  return null;
}

/**
 * Safely extract string
 */
function str(v: any): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s || null;
}

/* ============================================================
   HANDLER
============================================================ */
serve(async (req) => {
  try {
    const body = await req.json().catch(() => null);

    if (!body) {
      return new Response("Invalid JSON", { status: 400 });
    }

    const {
      organization_id,
      rows,
      label, // optional label/tag
    } = body;

    if (!organization_id || !Array.isArray(rows)) {
      return new Response("Invalid payload", { status: 400 });
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      // Accept phone from ANY key that frontend resolved
      const rawPhone =
        row.phone ??
        row.mobile ??
        row.mobile_no ??
        row["mobile no"] ??
        row.contact ??
        row.contact_number ??
        null;

      const phone = normalizePhoneToE164India(rawPhone);
      if (!phone) {
        skipped++;
        continue;
      }

      // Fetch existing contact
      const { data: existing, error: fetchError } = await supabase
        .from("contacts")
        .select("*")
        .eq("organization_id", organization_id)
        .eq("phone", phone)
        .maybeSingle();

      if (fetchError) {
        console.error("[contact-bulk-upload] fetch error", fetchError);
        skipped++;
        continue;
      }

      // ----------------------------
      // INSERT
      // ----------------------------
      if (!existing) {
        const insertPayload: any = {
          organization_id,
          phone,
          name: str(row.name),
          first_name: str(row.first_name ?? row.firstname),
          last_name: str(row.last_name ?? row.lastname),
          model: str(row.model ?? row.vehicle_model),
          metadata: row, // ✅ FULL RAW ROW STORED
          labels: label ? { [label]: true } : null,
        };

        const { error } = await supabase.from("contacts").insert(insertPayload);
        if (error) {
          console.error("[contact-bulk-upload] insert error", error);
          skipped++;
        } else {
          inserted++;
        }
        continue;
      }

      // ----------------------------
      // UPDATE (SAFE ENRICH ONLY)
      // ----------------------------
      const updatePayload: any = {};

      if (!existing.name && row.name) updatePayload.name = str(row.name);
      if (!existing.first_name && row.first_name)
        updatePayload.first_name = str(row.first_name);
      if (!existing.last_name && row.last_name)
        updatePayload.last_name = str(row.last_name);
      if (!existing.model && row.model)
        updatePayload.model = str(row.model);

      // Merge metadata (non-destructive)
      updatePayload.metadata = {
        ...(existing.metadata || {}),
        ...row,
      };

      // Merge labels
      if (label) {
        updatePayload.labels = {
          ...(existing.labels || {}),
          [label]: true,
        };
      }

      if (Object.keys(updatePayload).length === 0) {
        skipped++;
        continue;
      }

      const { error: updateError } = await supabase
        .from("contacts")
        .update(updatePayload)
        .eq("id", existing.id);

      if (updateError) {
        console.error("[contact-bulk-upload] update error", updateError);
        skipped++;
      } else {
        updated++;
      }
    }

    return new Response(
      JSON.stringify({ inserted, updated, skipped }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[contact-bulk-upload] fatal error", err);
    return new Response("Upload failed", { status: 500 });
  }
});
