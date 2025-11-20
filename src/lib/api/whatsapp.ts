import { supabase } from "../supabaseClient";
import type { WhatsappSettings } from "../../types/database";

/**
 * Fetch WhatsApp settings for a given organization_id
 */
export async function fetchWhatsappSettings(
  organizationId: string
): Promise<WhatsappSettings | null> {
  const { data, error } = await supabase
    .from("whatsapp_settings")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("[WA-SETTINGS] Load error:", error);
    throw error;
  }

  if (!data) return null;

  // 🔥 Normalize nullable fields (prevents UI from breaking)
  return {
    ...data,
    phone_number: data.phone_number ?? "",
    api_token: data.api_token ?? "",
    verify_token: data.verify_token ?? "",
    whatsapp_phone_id: data.whatsapp_phone_id ?? "",
    whatsapp_business_id: data.whatsapp_business_id ?? "",
    is_active: data.is_active ?? true,
  } as WhatsappSettings;
}

/**
 * Upsert WhatsApp settings for a given organization_id
 */
export async function upsertWhatsappSettings(
  organizationId: string,
  values: Partial<WhatsappSettings>
): Promise<WhatsappSettings> {
  const payload = {
    organization_id: organizationId,

    phone_number: values.phone_number ?? null,
    api_token: values.api_token ?? null,
    verify_token: values.verify_token ?? null,
    whatsapp_phone_id: values.whatsapp_phone_id ?? null,
    whatsapp_business_id: values.whatsapp_business_id ?? null,

    // Optional but safe: always true unless disabled manually
    is_active: values.is_active ?? true,
  };

  const { data, error } = await supabase
    .from("whatsapp_settings")
    .upsert(payload, {
      onConflict: "organization_id", // enforce 1 row per org
    })
    .select()
    .maybeSingle();

  if (error) {
    console.error("[WA-SETTINGS] Save error:", error);
    throw error;
  }

  // Normalize the response
  return {
    ...data,
    phone_number: data.phone_number ?? "",
    api_token: data.api_token ?? "",
    verify_token: data.verify_token ?? "",
    whatsapp_phone_id: data.whatsapp_phone_id ?? "",
    whatsapp_business_id: data.whatsapp_business_id ?? "",
    is_active: data.is_active ?? true,
  } as WhatsappSettings;
}
