// src/modules/leads/api.ts
import { supabase } from "../../lib/supabaseClient";

export type LeadsFilter =
  | "overdue"
  | "due_today"
  | "due_tomorrow"
  | "new_assigned"
  | "hot";

export type LeadStatusFilter =
  | "new"
  | "contacted"
  | "qualified"
  | "visit_scheduled"
  | "booked"
  | "lost";

export type LeadPriorityFilter = "cold" | "warm" | "hot";

export type LeadsSort = {
  field?: "next_followup_at" | "last_contacted_at" | "priority" | "lead_status";
  direction?: "asc" | "desc";
};

export type ListLeadsParams = {
  filter?: LeadsFilter;
  search?: string;
  status?: LeadStatusFilter | "all";
  priority?: LeadPriorityFilter | "all";
  sort?: LeadsSort;
  limit?: number;
  cursor?: {
    // simple keyset pagination for next_followup_at + id
    next_followup_at: string | null;
    id: string;
  };
};

export type LeadRow = {
  id: string;
  organization_id: string;
  name: string | null;
  phone: string | null;
  model: string | null;
  assigned_to_user_id: string | null;
  lead_status: string | null;
  priority: string | null;
  next_followup_at: string | null;
  last_contacted_at: string | null;
  last_outcome: string | null;
  lost_reason: string | null;
};

const leadSelect =
  "id,organization_id,name,phone,model,assigned_to_user_id,lead_status,priority,next_followup_at,last_contacted_at,last_outcome,lost_reason";

function startOfDayISO(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function applyFilter(query: any, filter?: LeadsFilter) {
  if (!filter) return query;

  const now = new Date();

  switch (filter) {
    case "overdue": {
      // due before now
      return query.not("next_followup_at", "is", null).lt("next_followup_at", now.toISOString());
    }
    case "due_today": {
      const start = startOfDayISO(now);
      const end = startOfDayISO(addDays(now, 1));
      return query
        .not("next_followup_at", "is", null)
        .gte("next_followup_at", start)
        .lt("next_followup_at", end);
    }
    case "due_tomorrow": {
      const start = startOfDayISO(addDays(now, 1));
      const end = startOfDayISO(addDays(now, 2));
      return query
        .not("next_followup_at", "is", null)
        .gte("next_followup_at", start)
        .lt("next_followup_at", end);
    }
    case "new_assigned": {
      // assigned (not null) and new
      return query
        .not("assigned_to_user_id", "is", null)
        .eq("lead_status", "new");
    }
    case "hot": {
      return query.eq("priority", "hot");
    }
    default:
      return query;
  }
}

function applySort(query: any, sort?: LeadsSort) {
  const field = sort?.field ?? "next_followup_at";
  const ascending = (sort?.direction ?? "asc") === "asc";

  // Default requirement: next_followup_at asc (nulls last)
  if (field === "next_followup_at") {
    // Supabase supports nullsFirst; nulls last => nullsFirst:false when ascending.
    return query
      .order("next_followup_at", { ascending, nullsFirst: false })
      .order("id", { ascending: true });
  }

  // For other fields, keep deterministic ordering with id tiebreak.
  return query.order(field, { ascending }).order("id", { ascending: true });
}

function applyCursor(query: any, cursor: ListLeadsParams["cursor"] | undefined) {
  if (!cursor) return query;

  // We only support cursoring when sorting by next_followup_at asc (default).
  // Implements: (next_followup_at, id) > (cursor.next_followup_at, cursor.id)
  // with NULLS LAST semantics: cursor.next_followup_at should never be null for sane paging.
  if (!cursor.next_followup_at) return query;

  const ts = cursor.next_followup_at;
  const id = cursor.id;

  // Equivalent SQL:
  // WHERE (next_followup_at > ts) OR (next_followup_at = ts AND id > id)
  return query.or(
    `next_followup_at.gt.${ts},and(next_followup_at.eq.${ts},id.gt.${id})`
  );
}

function applySearch(query: any, search?: string) {
  const q = String(search ?? "").trim();
  if (!q) return query;

  // match by name (ILIKE %q%) OR phone (ILIKE %digits%)
  const digits = q.replace(/\D/g, "");
  const nameTerm = `%${q}%`;

  if (digits) {
    return query.or(`name.ilike.${nameTerm},phone.ilike.%${digits}%`);
  }
  return query.ilike("name", nameTerm);
}

function applyFacetFilters(query: any, params: ListLeadsParams) {
  if (params.status && params.status !== "all") {
    query = query.eq("lead_status", params.status);
  }
  if (params.priority && params.priority !== "all") {
    query = query.eq("priority", params.priority);
  }
  return query;
}

export async function listLeads(params: ListLeadsParams = {}) {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);

  // IMPORTANT: do not pass organization_id constraint here.
  // RLS is responsible for scoping to org + assignment based on current user.
  let query = supabase.from("contacts").select(leadSelect).limit(limit);

  query = applySearch(query, params.search);
  query = applyFacetFilters(query, params);
  query = applyFilter(query, params.filter);
  query = applySort(query, params.sort);
  query = applyCursor(query, params.cursor);

  const { data, error } = await query;
  if (error) {
    console.error("[listLeads]", error);
    throw error;
  }

  const rows = (data ?? []) as LeadRow[];

  const nextCursor =
    rows.length === limit
      ? {
          next_followup_at: rows[rows.length - 1]?.next_followup_at ?? null,
          id: rows[rows.length - 1]?.id,
        }
      : null;

  return { rows, nextCursor };
}

export async function getLead(contactId: string) {
  const { data, error } = await supabase
    .from("contacts")
    .select(leadSelect)
    .eq("id", contactId)
    .single();

  if (error) {
    console.error("[getLead]", error);
    throw error;
  }

  return data as LeadRow;
}

export type UpdateLeadInput = {
  lead_status?: LeadStatusFilter | null;
  last_outcome?: string | null;
  lost_reason?: string | null;
  next_followup_at?: string | null;
  // optional note; persisted into last_outcome if provided
  note?: string | null;
};

export async function updateLead(contactId: string, patch: UpdateLeadInput) {
  const nextOutcome = (() => {
    const outcome = patch.last_outcome ?? null;
    const note = (patch.note ?? "").trim();
    if (!note) return outcome;
    if (!outcome) return note;
    return `${outcome}\n\nNote: ${note}`;
  })();

  const updatePatch: Record<string, any> = {
    ...(patch.lead_status !== undefined ? { lead_status: patch.lead_status } : {}),
    ...(patch.next_followup_at !== undefined
      ? { next_followup_at: patch.next_followup_at }
      : {}),
    ...(patch.lost_reason !== undefined ? { lost_reason: patch.lost_reason } : {}),
    ...(patch.last_outcome !== undefined || patch.note !== undefined
      ? { last_outcome: nextOutcome }
      : {}),
    // update last_contacted_at when we record an outcome update
    ...(patch.last_outcome !== undefined || patch.note !== undefined
      ? { last_contacted_at: new Date().toISOString() }
      : {}),
  };

  const { data, error } = await supabase
    .from("contacts")
    .update(updatePatch)
    .eq("id", contactId)
    .select(leadSelect)
    .maybeSingle();

  if (error) {
    console.error("[updateLead]", error);
    throw error;
  }

  // If RLS blocks the update, PostgREST responds with 0 rows. Treat as not found.
  if (!data) {
    const e: any = new Error("Not found");
    e.code = "NOT_FOUND";
    throw e;
  }

  return data as LeadRow;
}

export async function assignLead(contactId: string, assignedToUserId: string | null) {
  const { data, error } = await supabase
    .from("contacts")
    .update({ assigned_to_user_id: assignedToUserId })
    .eq("id", contactId)
    .select(leadSelect)
    .maybeSingle();

  if (error) {
    console.error("[assignLead]", error);
    throw error;
  }

  // If RLS blocks the update, PostgREST responds with 0 rows.
  if (!data) {
    const e: any = new Error("Not found");
    e.code = "NOT_FOUND";
    throw e;
  }

  return data as LeadRow;
}
