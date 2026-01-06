//Users/air/dealership-ai-platform/src/lib/api/whatsapp.ts
import { supabase } from "../supabaseClient";
import type { WhatsappSettings } from "../../types/database";

/* =============================================================================
   FETCH WhatsApp settings (ORGANIZATION ONLY)
============================================================================= */
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

  return {
    ...data,
    organization_id: data.organization_id ?? organizationId,

    phone_number: data.phone_number ?? "",
    api_token: data.api_token ?? "",
    verify_token: data.verify_token ?? "",
    whatsapp_phone_id: data.whatsapp_phone_id ?? "",
    whatsapp_business_id: data.whatsapp_business_id ?? "",
    is_active: data.is_active ?? true,
  } as WhatsappSettings;
}

/* =============================================================================
   UPSERT WhatsApp settings (ORGANIZATION ONLY)
============================================================================= */
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

    is_active: values.is_active ?? true,
  };

  const { data, error } = await supabase
    .from("whatsapp_settings")
    .upsert(payload, {
      onConflict: "organization_id",
    })
    .select()
    .maybeSingle();

  if (error) {
    console.error("[WA-SETTINGS] Save error:", error);
    throw error;
  }

  return {
    ...data,
    organization_id: data.organization_id ?? organizationId,

    phone_number: data.phone_number ?? "",
    api_token: data.api_token ?? "",
    verify_token: data.verify_token ?? "",
    whatsapp_phone_id: data.whatsapp_phone_id ?? "",
    whatsapp_business_id: data.whatsapp_business_id ?? "",
    is_active: data.is_active ?? true,
  } as WhatsappSettings;
}