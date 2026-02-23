// src/modules/leads/LeadDetailPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, X } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

import { ChatMessageBubble } from "../chats/components/ChatMessageBubble";
import type { Message } from "../../types/database";

import {
  getLead,
  assignLead,
  updateLead,
  type LeadRow,
  type LeadStatusFilter,
} from "./api";

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-sm text-slate-900">{value ?? "—"}</div>
    </div>
  );
}

function fmt(ts: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString();
}

function toDatetimeLocalValue(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";

  // datetime-local wants: YYYY-MM-DDTHH:mm (local)
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function parseDatetimeLocalAsIso(v: string): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

type UpdateDraft = {
  lead_status: LeadStatusFilter | "";
  last_outcome: string;
  note: string;
  lost_reason: string;
  next_followup_at_local: string; // datetime-local
};

export function LeadDetailPage() {
  const { contactId } = useParams();
  const nav = useNavigate();

  const [canReassign, setCanReassign] = useState(false);
  const [roleLabel, setRoleLabel] = useState<string | null>(null);
  const [assigneesLoading, setAssigneesLoading] = useState(false);
  const [assignees, setAssignees] = useState<{ user_id: string; label: string }[]>([]);
  const [reassigning, setReassigning] = useState(false);
  const [reassignError, setReassignError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [lead, setLead] = useState<LeadRow | null>(null);

  // Security requirement: if RLS blocks access, show Not found.
  const [notFound, setNotFound] = useState(false);

  const [openUpdate, setOpenUpdate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [summaryLoading, setSummaryLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);

  const [tab, setTab] = useState<"details" | "chat">("details");

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [thread, setThread] = useState<Message[]>([]);

  const [draft, setDraft] = useState<UpdateDraft>({
    lead_status: "",
    last_outcome: "",
    note: "",
    lost_reason: "",
    next_followup_at_local: "",
  });

  useEffect(() => {
    if (!contactId) return;

    let cancelled = false;
    setLoading(true);
    setNotFound(false);

    void (async () => {
      try {
        const row = await getLead(contactId);
        if (cancelled) return;
        setLead(row);
      } catch {
        // Always treat as Not found (avoid leaking permission details)
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [contactId]);

  useEffect(() => {
    if (!contactId) return;

    let cancelled = false;
    setSummaryLoading(true);
    setAiSummary(null);

    void (async () => {
      try {
        const { data, error } = await supabase
          .from("conversations")
          .select("id, ai_summary, last_message_at")
          .eq("contact_id", contactId)
          .order("last_message_at", { ascending: false })
          .limit(1);

        if (error) throw error;
        if (cancelled) return;

        const row = (data ?? [])[0] as any;
        setConversationId((row?.id ?? null) as string | null);
        setAiSummary((row?.ai_summary ?? null) as string | null);
      } catch {
        // Don't leak anything; just show no summary.
        if (!cancelled) setAiSummary(null);
        if (!cancelled) setConversationId(null);
      } finally {
        if (!cancelled) setSummaryLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [contactId]);

  useEffect(() => {
    if (!conversationId) {
      setThread([]);
      return;
    }

    let cancelled = false;
    setThreadLoading(true);

    void (async () => {
      // Requirement: order by order_at asc, fallback created_at asc
      // Implementation: try order_at, if backend errors (missing column), fallback to created_at.
      const base = () =>
        supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", conversationId)
          .limit(500);

      try {
        const { data, error } = await base().order("order_at", { ascending: true });
        if (error) throw error;
        if (!cancelled) setThread((data ?? []) as Message[]);
      } catch {
        try {
          const { data } = await base().order("created_at", { ascending: true });
          if (!cancelled) setThread((data ?? []) as Message[]);
        } catch {
          if (!cancelled) setThread([]);
        }
      } finally {
        if (!cancelled) setThreadLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useEffect(() => {
    // Determine role and assignee set using RLS-scoped tables.
    // RBAC intent:
    // - owner/admin: assignees = all org users
    // - team_leader: assignees = members of teams they lead
    // - agent: no assign UI
    let cancelled = false;

    void (async () => {
      try {
        const { data: userRes } = await supabase.auth.getUser();
        const userId = userRes.user?.id;
        if (!userId) return;

        if (!lead) return;
        const orgId = (lead as any).organization_id as string | null;
        if (!orgId) return;

        const { data: roleRow } = await supabase
          .from("organization_users")
          .select("role")
          .eq("organization_id", orgId)
          .eq("user_id", userId)
          .maybeSingle();

        const role = String((roleRow as any)?.role ?? "").toLowerCase();
        const isAdmin = role === "admin" || role === "owner";
        const isTeamLeader = role === "team_leader";

        if (cancelled) return;

        setRoleLabel(role || null);
        setCanReassign(isAdmin || isTeamLeader);

        // Agents/sales: hide assign UI and don't fetch assignees.
        if (!(isAdmin || isTeamLeader)) {
          setAssignees([]);
          return;
        }

        setAssigneesLoading(true);

        if (isAdmin) {
          // Admin/owner: all org users in organization_users (RLS governs access)
          const { data: orgUsers, error } = await supabase
            .from("organization_users")
            .select("user_id")
            .eq("organization_id", orgId);

          if (cancelled) return;

          if (error) {
            setAssignees([]);
          } else {
            const unique = new Map<string, { user_id: string; label: string }>();
            for (const u of orgUsers ?? []) {
              const id = (u as any).user_id as string | null;
              if (!id) continue;
              if (!unique.has(id)) unique.set(id, { user_id: id, label: id });
            }
            setAssignees(Array.from(unique.values()));
          }
          return;
        }

        // Team leader: only members of teams they lead in this org.
        // Query teams led by current user, then team_members for those teams.
        const { data: teamsLed, error: teamsErr } = await supabase
          .from("teams")
          .select("id")
          .eq("organization_id", orgId)
          .eq("leader_user_id", userId);

        if (cancelled) return;

        if (teamsErr || !teamsLed || teamsLed.length === 0) {
          setAssignees([]);
          return;
        }

        const teamIds = teamsLed.map((t: any) => t.id).filter(Boolean);

        const { data: members, error: membersErr } = await supabase
          .from("team_members")
          .select("user_id")
          .in("team_id", teamIds);

        if (cancelled) return;

        if (membersErr) {
          setAssignees([]);
          return;
        }

        const unique = new Map<string, { user_id: string; label: string }>();

        // Include team leader themselves as an option.
        unique.set(userId, { user_id: userId, label: userId });

        for (const m of members ?? []) {
          const id = (m as any).user_id as string | null;
          if (!id) continue;
          if (!unique.has(id)) unique.set(id, { user_id: id, label: id });
        }

        setAssignees(Array.from(unique.values()));
      } catch {
        if (!cancelled) {
          setCanReassign(false);
          setAssignees([]);
        }
      } finally {
        if (!cancelled) setAssigneesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lead]);

  const title = useMemo(() => {
    return lead?.name ?? lead?.phone ?? "Lead";
  }, [lead?.name, lead?.phone]);

  function openModal() {
    if (!lead) return;

    setFormError(null);
    setDraft({
      lead_status: (lead.lead_status as any) ?? "",
      last_outcome: lead.last_outcome ?? "",
      note: "",
      lost_reason: lead.lost_reason ?? "",
      next_followup_at_local: toDatetimeLocalValue(lead.next_followup_at),
    });
    setOpenUpdate(true);
  }

  function validateAndBuildPatch() {
    const lead_status = (draft.lead_status || null) as LeadStatusFilter | null;

    const isLost = lead_status === "lost";
    const isBooked = lead_status === "booked";

    const lost_reason = (draft.lost_reason ?? "").trim();
    const nextFollowupIso = parseDatetimeLocalAsIso(draft.next_followup_at_local);

    if (isLost && !lost_reason) {
      return { ok: false as const, message: "Lost reason is required when status is lost." };
    }

    // next_followup_at rules
    if (isBooked || isLost) {
      // allowed to be null
    } else {
      if (!nextFollowupIso) {
        return { ok: false as const, message: "Next follow-up is required for this status." };
      }
    }

    return {
      ok: true as const,
      patch: {
        lead_status,
        last_outcome: (draft.last_outcome ?? "").trim() || null,
        note: (draft.note ?? "").trim() || null,
        lost_reason: isLost ? lost_reason : null,
        next_followup_at: (isBooked || isLost) ? nextFollowupIso : nextFollowupIso,
      },
    };
  }

  async function onSaveUpdate() {
    if (!contactId) return;

    const built = validateAndBuildPatch();
    if (!built.ok) {
      setFormError(built.message);
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const updated = await updateLead(contactId, built.patch);
      setLead(updated);
      setOpenUpdate(false);
    } catch {
      // If blocked by RLS (0 rows), treat as Not found
      setOpenUpdate(false);
      setLead(null);
      setNotFound(true);
    } finally {
      setSaving(false);
    }
  }

  async function onChangeAssignee(v: string) {
    if (!contactId) return;
    setReassignError(null);
    setReassigning(true);
    try {
      const nextAssignee = v === "" ? null : v;
      const updated = await assignLead(contactId, nextAssignee);
      setLead(updated);
    } catch (e: any) {
      // Friendly error; do not reveal permissions.
      setReassignError(
        "Couldn't reassign this lead. Please check your access and try again."
      );
    } finally {
      setReassigning(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-4 p-3 sm:gap-6 sm:p-6">
      <header className="flex items-start justify-between">
        <div>
          <button
            onClick={() => nav("/leads")}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs hover:bg-slate-50"
          >
            <ArrowLeft size={14} /> Back
          </button>
          <h1 className="mt-3 text-2xl font-semibold text-slate-900">
            {title}
          </h1>
          <p className="mt-1 text-sm text-slate-500">Lead details</p>
        </div>

        {!!lead && (
          <button
            onClick={openModal}
            className="rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800"
          >
            Update Lead
          </button>
        )}
      </header>

      {loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : notFound ? (
        <div className="text-sm text-slate-500">Not found.</div>
      ) : !lead ? (
        <div className="text-sm text-slate-500">Not found.</div>
      ) : (
        <>
          {/* Tabs */}
          <div className="-mx-3 flex items-center gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:overflow-visible sm:px-0">
            <button
              onClick={() => setTab("details")}
              className={`rounded-md border px-3 py-2 text-sm ${
                tab === "details"
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Details
            </button>
            <button
              onClick={() => setTab("chat")}
              className={`rounded-md border px-3 py-2 text-sm ${
                tab === "chat"
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Chat
            </button>
          </div>

          {tab === "details" ? (
            <>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Field label="Customer" value={lead.name ?? "—"} />
                <Field label="Phone" value={lead.phone} />
                <Field label="Status" value={lead.lead_status} />
                <Field label="Priority" value={lead.priority} />
                <Field label="Next follow-up" value={fmt(lead.next_followup_at)} />
                <Field label="Last outcome" value={lead.last_outcome} />
                <Field label="Lost reason" value={lead.lost_reason} />
              </div>

              {canReassign ? (
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold text-slate-900">Assign lead</h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {roleLabel === "team_leader"
                          ? "You can assign within your team."
                          : "You can assign to any org user."}
                      </p>
                    </div>
                    <div className="text-xs text-slate-500">
                      {assigneesLoading ? "Loading…" : null}
                    </div>
                  </div>

                  {reassignError ? (
                    <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      {reassignError}
                    </div>
                  ) : null}

                  <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center">
                    <select
                      value={lead.assigned_to_user_id ?? ""}
                      onChange={(e) => void onChangeAssignee(e.target.value)}
                      disabled={reassigning || assigneesLoading}
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm md:w-96 disabled:opacity-50"
                    >
                      <option value="">Unassigned</option>
                      {assignees.map((a) => (
                        <option key={a.user_id} value={a.user_id}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                    <div className="text-xs text-slate-500">
                      {reassigning ? "Saving…" : null}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">AI Summary</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Summary from the most recent conversation.
                    </p>
                  </div>
                  <div className="text-xs text-slate-500">
                    {summaryLoading ? "Loading…" : null}
                  </div>
                </div>

                <div className="mt-3">
                  {aiSummary ? (
                    <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                      {aiSummary
                        .split("\n")
                        .map((s) => s.trim())
                        .filter(Boolean)
                        .map((line, idx) => (
                          <li key={idx}>{line}</li>
                        ))}
                    </ul>
                  ) : (
                    <div className="text-sm text-slate-500">No summary yet.</div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
                <div className="text-sm font-semibold text-slate-900">Chat</div>
                <div className="text-xs text-slate-500">
                  {threadLoading ? "Loading…" : conversationId ? `${thread.length} message(s)` : "No conversation"}
                </div>
              </div>

              {!conversationId ? (
                <div className="p-5 text-sm text-slate-500">
                  No conversation found for this contact.
                </div>
              ) : thread.length === 0 && !threadLoading ? (
                <div className="p-5 text-sm text-slate-500">No messages.</div>
              ) : (
                <div className="max-h-[calc(100vh-320px)] overflow-y-auto space-y-4 p-5">
                  {thread.map((m) => (
                    <ChatMessageBubble key={m.id} message={m} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Update Lead Modal */}
          {openUpdate ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold">Update Lead</h2>
                    <div className="mt-1 text-xs text-slate-500">
                      {lead.name ?? lead.phone ?? lead.id}
                    </div>
                  </div>
                  <button
                    onClick={() => setOpenUpdate(false)}
                    className="rounded-md p-1 hover:bg-slate-100"
                  >
                    <X size={18} />
                  </button>
                </div>

                {formError ? (
                  <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    {formError}
                  </div>
                ) : null}

                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      Lead status
                    </label>
                    <select
                      value={draft.lead_status}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          lead_status: e.target.value as any,
                        }))
                      }
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="">—</option>
                      <option value="new">New</option>
                      <option value="contacted">Contacted</option>
                      <option value="qualified">Qualified</option>
                      <option value="visit_scheduled">Visit scheduled</option>
                      <option value="booked">Booked</option>
                      <option value="lost">Lost</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      Last outcome
                    </label>
                    <textarea
                      value={draft.last_outcome}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, last_outcome: e.target.value }))
                      }
                      rows={3}
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                      placeholder="What happened on the last contact?"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      Note (optional)
                    </label>
                    <input
                      value={draft.note}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, note: e.target.value }))
                      }
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                      placeholder="Optional internal note"
                    />
                    <div className="mt-1 text-[11px] text-slate-500">
                      Stored together with last outcome.
                    </div>
                  </div>

                  {draft.lead_status === "lost" ? (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Lost reason (required)
                      </label>
                      <input
                        value={draft.lost_reason}
                        onChange={(e) =>
                          setDraft((p) => ({
                            ...p,
                            lost_reason: e.target.value,
                          }))
                        }
                        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                        placeholder="Why was this lead lost?"
                      />
                    </div>
                  ) : null}

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      Next follow-up
                    </label>
                    <input
                      type="datetime-local"
                      value={draft.next_followup_at_local}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          next_followup_at_local: e.target.value,
                        }))
                      }
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    />
                    <div className="mt-1 text-[11px] text-slate-500">
                      Required unless status is Booked or Lost.
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      onClick={() => setOpenUpdate(false)}
                      disabled={saving}
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs hover:bg-slate-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={onSaveUpdate}
                      disabled={saving}
                      className="rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
