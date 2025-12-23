import { supabase } from "./supabaseClient";

export async function upsertContactByPhone(params: {
  organization_id: string;
  sub_organization_id?: string | null;
  phone: string;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  model?: string | null;
}) {
  const {
    organization_id,
    sub_organization_id = null,
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
        sub_organization_id,
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
