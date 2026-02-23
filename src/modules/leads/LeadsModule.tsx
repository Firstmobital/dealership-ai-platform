// src/modules/leads/LeadsModule.tsx

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOrganizationStore } from "../../state/useOrganizationStore";
import { supabase } from "../../lib/supabaseClient";

import {
  listLeads,
  type LeadRow,
  type LeadsFilter,
  type LeadStatusFilter,
  type LeadPriorityFilter,
} from "./api";

function Pill({ active, children }: { active: boolean; children: any }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${
        active
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : "border-slate-200 bg-slate-50 text-slate-600"
      }`}
    >
      {children}
    </span>
  );
}

function formatWhen(ts: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString();
}

export function LeadsModule() {
  const nav = useNavigate();
  const { activeOrganization } = useOrganizationStore();

  const [isTeamLeader, setIsTeamLeader] = useState(false);
  const [isLeadAdmin, setIsLeadAdmin] = useState(false);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<LeadRow[]>([]);

  // tabs
  const [tab, setTab] = useState<"my_day" | "leads" | "team_day" | "team_leads">(
    "my_day"
  );

  // leads list controls
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<LeadStatusFilter | "all">("all");
  const [priority, setPriority] = useState<LeadPriorityFilter | "all">("all");

  // Team leads filter
  const [assignedTo, setAssignedTo] = useState<string | "all">("all");
  const [salespeople, setSalespeople] = useState<
    { user_id: string; label: string }[]
  >([]);

  const [teamDayLoading, setTeamDayLoading] = useState(false);
  const [teamOverdueByAssignee, setTeamOverdueByAssignee] = useState<
    { assigned_to_user_id: string | null; count: number }[]
  >([]);
  const [teamSlaBreaches, setTeamSlaBreaches] = useState<number>(0);

  // my day buckets
  const [bucketLoading, setBucketLoading] = useState(false);
  const [bucketCounts, setBucketCounts] = useState<Record<LeadsFilter, number>>({
    overdue: 0,
    due_today: 0,
    due_tomorrow: 0,
    new_assigned: 0,
    hot: 0,
  });

  useEffect(() => {
    if (!activeOrganization?.id) return;

    let cancelled = false;
    void (async () => {
      try {
        const { data: userRes } = await supabase.auth.getUser();
        const userId = userRes.user?.id;
        if (!userId) return;

        const { data } = await supabase
          .from("organization_users")
          .select("role")
          .eq("organization_id", activeOrganization.id)
          .eq("user_id", userId)
          .maybeSingle();

        if (cancelled) return;
        const role = String((data as any)?.role ?? "").toLowerCase();
        setIsTeamLeader(role === "team_leader");
        setIsLeadAdmin(role === "team_leader" || role === "lead_manager");
      } catch {
        if (!cancelled) {
          setIsTeamLeader(false);
          setIsLeadAdmin(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeOrganization?.id]);

  useEffect(() => {
    if (!isLeadAdmin || !activeOrganization?.id) return;

    let cancelled = false;
    void (async () => {
      // RLS should scope to the team leader/lead manager's accessible users.
      const { data, error } = await supabase
        .from("organization_users")
        .select("user_id")
        .eq("organization_id", activeOrganization.id);

      if (cancelled) return;
      if (error) {
        setSalespeople([]);
        return;
      }

      const list = (data ?? []).map((r: any) => ({
        user_id: r.user_id,
        label: r.user_id,
      }));
      setSalespeople(list);
    })();

    return () => {
      cancelled = true;
    };
  }, [isLeadAdmin, activeOrganization?.id]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      try {
        const res = await listLeads({
          limit: 50,
          search,
          status,
          priority,
        });
        if (!cancelled) setRows(res.rows);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [search, status, priority]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setBucketLoading(true);
      try {
        const filters: LeadsFilter[] = [
          "overdue",
          "due_today",
          "due_tomorrow",
          "new_assigned",
          "hot",
        ];

        const results = await Promise.all(
          filters.map(async (f) => {
            const res = await listLeads({ filter: f, limit: 200 });
            return [f, res.rows.length] as const;
          })
        );

        if (cancelled) return;
        setBucketCounts((prev) => {
          const next = { ...prev } as any;
          for (const [f, n] of results) next[f] = n;
          return next;
        });
      } finally {
        if (!cancelled) setBucketLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isLeadAdmin) return;

    let cancelled = false;
    void (async () => {
      setTeamDayLoading(true);
      try {
        // Overdue list (RLS scoped)
        const overdueRes = await listLeads({ filter: "overdue", limit: 200 });

        if (cancelled) return;

        const grouped = new Map<string, number>();
        const nullKey = "__unassigned__";
        for (const r of overdueRes.rows) {
          const key = r.assigned_to_user_id ?? nullKey;
          grouped.set(key, (grouped.get(key) ?? 0) + 1);
        }

        const groupedArr = Array.from(grouped.entries())
          .map(([k, count]) => ({
            assigned_to_user_id: k === nullKey ? null : k,
            count,
          }))
          .sort((a, b) => b.count - a.count);

        setTeamOverdueByAssignee(groupedArr);

        // SLA breaches: new leads older than 60 minutes with no last_contacted_at
        // Uses contacts.created_at (not in leadSelect) via a direct RLS-scoped query.
        const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data: slaRows, error } = await supabase
          .from("contacts")
          .select("id")
          .eq("lead_status", "new")
          .is("last_contacted_at", null)
          .lt("created_at", cutoff)
          .limit(500);

        if (error) {
          setTeamSlaBreaches(0);
        } else {
          setTeamSlaBreaches((slaRows ?? []).length);
        }
      } finally {
        if (!cancelled) setTeamDayLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLeadAdmin]);

  const visibleRows = useMemo(() => rows, [rows]);

  const teamLeadRows = useMemo(() => {
    if (!isLeadAdmin) return [] as LeadRow[];
    if (tab !== "team_leads") return [] as LeadRow[];
    if (assignedTo === "all") return visibleRows;
    return visibleRows.filter((r) => r.assigned_to_user_id === assignedTo);
  }, [isLeadAdmin, tab, assignedTo, visibleRows]);

  return (
    <div className="flex w-full flex-col gap-4 p-3 sm:gap-6 sm:p-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Leads</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage follow-ups and your sales pipeline.
          </p>
        </div>
      </header>

      {/* Tabs */}
      <div className="-mx-3 flex items-center gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        <button
          onClick={() => setTab("my_day")}
          className={`rounded-md border px-3 py-2 text-sm ${
            tab === "my_day"
              ? "border-blue-300 bg-blue-50 text-blue-700"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          My Day
        </button>
        <button
          onClick={() => setTab("leads")}
          className={`rounded-md border px-3 py-2 text-sm ${
            tab === "leads"
              ? "border-blue-300 bg-blue-50 text-blue-700"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          Leads
        </button>

        {isLeadAdmin ? (
          <>
            <button
              onClick={() => setTab("team_day")}
              className={`rounded-md border px-3 py-2 text-sm ${
                tab === "team_day"
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Team Day
            </button>
            <button
              onClick={() => setTab("team_leads")}
              className={`rounded-md border px-3 py-2 text-sm ${
                tab === "team_leads"
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Team Leads
            </button>
          </>
        ) : null}
      </div>

      {/* Content */}
      {tab === "my_day" ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">My Day</h2>
              <p className="mt-1 text-sm text-slate-500">
                Prioritize follow-ups based on what's due.
              </p>
            </div>
            <div className="text-xs text-slate-500">
              {bucketLoading ? "Refreshing…" : "RLS scoped"}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                ["Overdue", "overdue"],
                ["Due Today", "due_today"],
                ["Due Tomorrow", "due_tomorrow"],
                ["New Assigned", "new_assigned"],
                ["Hot", "hot"],
              ] as const
            ).map(([label, key]) => (
              <button
                key={key}
                onClick={() => setTab("leads")}
                className="rounded-xl border border-slate-200 bg-white p-4 text-left hover:bg-slate-50"
              >
                <div className="text-xs font-medium text-slate-500">{label}</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">
                  {bucketCounts[key] ?? 0}
                </div>
                <div className="mt-2 text-xs text-slate-500">Tap to view leads</div>
              </button>
            ))}
          </div>
        </section>
      ) : tab === "team_day" && isLeadAdmin ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Team Day</h2>
              <p className="mt-1 text-sm text-slate-500">
                Team-wide overdue and SLA health (RLS scoped).
              </p>
            </div>
            <div className="text-xs text-slate-500">
              {teamDayLoading ? "Loading…" : "RLS scoped"}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">
                Overdue (by assignee)
              </div>
              <div className="mt-2 space-y-2">
                {teamOverdueByAssignee.length === 0 && !teamDayLoading ? (
                  <div className="text-sm text-slate-500">No overdue leads.</div>
                ) : (
                  teamOverdueByAssignee.map((g) => (
                    <div
                      key={g.assigned_to_user_id ?? "unassigned"}
                      className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
                    >
                      <div className="text-slate-700">
                        {g.assigned_to_user_id ?? "Unassigned"}
                      </div>
                      <div className="font-semibold text-slate-900">{g.count}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">SLA breaches</div>
              <div className="mt-1 text-xs text-slate-500">
                Uncontacted new leads older than 60 minutes
              </div>
              <div className="mt-3 text-3xl font-semibold text-slate-900">
                {teamSlaBreaches}
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Tip: SLA uses contact created_at + last_contacted_at.
              </div>
            </div>
          </div>
        </section>
      ) : tab === "team_leads" && isLeadAdmin ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Team Leads</h2>
              <p className="mt-1 text-sm text-slate-500">
                All team leads you can access (RLS scoped).
              </p>
            </div>
            <div className="text-xs text-slate-500">
              {loading ? "Loading…" : `${teamLeadRows.length} result(s)`}
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or phone"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-300"
            />

            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value as any)}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm md:w-64"
            >
              <option value="all">All salespeople</option>
              {salespeople.map((u) => (
                <option key={u.user_id} value={u.user_id}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
            <div className="grid grid-cols-1 gap-0 divide-y divide-slate-200">
              {teamLeadRows.map((r) => (
                <button
                  key={r.id}
                  onClick={() => nav(`/leads/${r.id}`)}
                  className="flex w-full flex-col gap-1 bg-white px-4 py-3 text-left hover:bg-slate-50"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">
                        {r.name ?? "Unnamed"}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {r.phone ?? "—"}
                        {r.assigned_to_user_id
                          ? ` · ${r.assigned_to_user_id}`
                          : " · Unassigned"}
                      </div>
                    </div>
                    <div className="text-xs text-slate-500">
                      Next: {formatWhen(r.next_followup_at)}
                    </div>
                  </div>
                </button>
              ))}

              {!loading && teamLeadRows.length === 0 ? (
                <div className="px-4 py-6 text-sm text-slate-500">No leads.</div>
              ) : null}
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Leads</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Search and filter leads available to your role.
                </p>
              </div>
              <div className="text-xs text-slate-500">
                {loading ? "Loading…" : `${visibleRows.length} result(s)`}
              </div>
            </div>

            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or phone"
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-300"
              />

              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm md:w-56"
              >
                <option value="all">All statuses</option>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="qualified">Qualified</option>
                <option value="visit_scheduled">Visit scheduled</option>
                <option value="booked">Booked</option>
                <option value="lost">Lost</option>
              </select>

              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm md:w-48"
              >
                <option value="all">All priority</option>
                <option value="cold">Cold</option>
                <option value="warm">Warm</option>
                <option value="hot">Hot</option>
              </select>
            </div>

            <div className="mt-2 overflow-hidden rounded-lg border border-slate-200">
              <div className="grid grid-cols-1 gap-0 divide-y divide-slate-200">
                {visibleRows.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => nav(`/leads/${r.id}`)}
                    className="flex w-full flex-col gap-1 bg-white px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">
                          {r.name ?? "Unnamed"}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {r.phone ?? "—"}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Pill active={!!r.lead_status}>{r.lead_status ?? "—"}</Pill>
                        <Pill active={!!r.priority}>{r.priority ?? "—"}</Pill>
                      </div>
                    </div>

                    <div className="text-xs text-slate-600">
                      Next follow-up:{" "}
                      <span className="font-medium">{formatWhen(r.next_followup_at)}</span>
                    </div>
                  </button>
                ))}

                {!loading && visibleRows.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-slate-500">
                    No leads match your filters.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
