function detectServiceTicketType(
  message: string
): Promise<"booking" | "status" | "complaint" | "general"> {
  const s = (message || "").toLowerCase();
  if (/(book|booking|appointment|slot|schedule|pickup|drop)/i.test(s))
    return Promise.resolve("booking");
  if (/(status|job card|jobcard|ready|done|completed)/i.test(s))
    return Promise.resolve("status");
  if (
    /(complaint|issue|problem|noise|vibration|not working|failed|refund|consumer|court)/i.test(
      s
    )
  )
    return Promise.resolve("complaint");
  return Promise.resolve("general");
}

export async function createServiceTicketIfNeeded(params: {
  supabaseAdmin: any;
  organization_id: string;
  conversation_id: string;
  contact_id?: string | null;
  channel: string;
  user_message: string;
  vehicle_number?: string | null;
  logger: any;
}) {
  try {
    const ticket_type = await detectServiceTicketType(params.user_message);

    // Avoid duplicates: if open/pending exists, reuse
    const { data: existing } = await params.supabaseAdmin
      .from("service_tickets")
      .select("id, status, created_at")
      .eq("organization_id", params.organization_id)
      .eq("conversation_id", params.conversation_id)
      .in("status", ["open", "pending"])
      .order("created_at", { ascending: false })
      .limit(1);

    if (existing && existing.length) return existing[0].id as string;

    const { data: created, error } = await params.supabaseAdmin
      .from("service_tickets")
      .insert({
        organization_id: params.organization_id,
        conversation_id: params.conversation_id,
        contact_id: params.contact_id ?? null,
        channel: params.channel,
        ticket_type,
        status: "open",
        vehicle_number: params.vehicle_number ?? null,
        description: params.user_message,
        created_by: "ai",
      })
      .select("id")
      .single();

    if (error) {
      params.logger.error("[service_ticket] create failed", { error });
      return null;
    }

    params.logger.info("[service_ticket] created", {
      id: created?.id,
      ticket_type,
    });
    return created?.id as string;
  } catch (e: any) {
    params.logger.error("[service_ticket] unexpected", { error: e });
    return null;
  }
}

