//Users/air/dealership-ai-platform/src/lib/contacts.ts

import { supabase } from "./supabaseClient";

export async function upsertContactByPhone(params: {
  organization_id: string;
  phone: string;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  model?: string | null;
}) {
  const {
    organization_id,
    phone,
    first_name = null,
    last_name = null,
    name = null,
    model = null,
  } = params;

  const { data, error } = await supabase
    .from("contacts")
    .upsert(
      {
        organization_id,
        phone,
        first_name,
        last_name,
        name,
        model,
      },
      {
        onConflict: "organization_id,phone",
      }
    )
    .select()
    .single();

  if (error) {
    console.error("[upsertContactByPhone]", error);
    throw error;
  }

  return data;
}
