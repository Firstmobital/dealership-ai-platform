// src/auth/orgRoles.ts

/** Organization-level roles (from public.organization_users.role). */
export type OrgRole = "owner" | "admin" | "lead_manager" | "team_leader" | "agent";

/** Canonical role string constants for consistent usage across the app. */
export const ORG_ROLES = {
  OWNER: "owner",
  ADMIN: "admin",
  LEAD_MANAGER: "lead_manager",
  TEAM_LEADER: "team_leader",
  AGENT: "agent",
} as const;

/** Roles that should see the full (multi-module) application UI. */
export function canAccessFullApp(role: OrgRole | null | undefined): boolean {
  return role === ORG_ROLES.OWNER || role === ORG_ROLES.ADMIN;
}

/** Roles that can use the Leads app UI (includes lead admins and standard agents). */
export function canAccessLeadsApp(role: OrgRole | null | undefined): boolean {
  // All defined org roles can access Leads (RLS still enforces what they can see).
  return (
    role === ORG_ROLES.OWNER ||
    role === ORG_ROLES.ADMIN ||
    role === ORG_ROLES.LEAD_MANAGER ||
    role === ORG_ROLES.TEAM_LEADER ||
    role === ORG_ROLES.AGENT
  );
}

/** Roles that should be offered org/team-wide leads views in the UI (subject to RLS). */
export function canAccessOrgWideLeads(role: OrgRole | null | undefined): boolean {
  return role === ORG_ROLES.LEAD_MANAGER || role === ORG_ROLES.TEAM_LEADER;
}

/** Roles whose UI should default to / restrict to only their own assigned leads (subject to RLS). */
export function canAccessOnlyOwnLeads(role: OrgRole | null | undefined): boolean {
  return role === ORG_ROLES.AGENT;
}
