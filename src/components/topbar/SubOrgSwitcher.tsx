// src/components/topbar/SubOrgSwitcher.tsx
import { useEffect } from "react";
import { useOrganizationStore } from "../../state/useOrganizationStore";
import { useSubOrganizationStore } from "../../state/useSubOrganizationStore";

export function SubOrgSwitcher() {
  const { currentOrganization } = useOrganizationStore();
  const {
    subOrgs,
    activeSubOrg,
    fetchSubOrgs,
    setActive,
    loading,
  } = useSubOrganizationStore();

  // Load sub-orgs when organization changes
  useEffect(() => {
    if (!currentOrganization) return;
    fetchSubOrgs(currentOrganization.id).catch(console.error);
  }, [currentOrganization?.id, fetchSubOrgs]);

  if (!currentOrganization) {
    return (
      <div className="text-xs text-slate-500">
        Select an organization to choose division
      </div>
    );
  }

  if (loading && !subOrgs.length) {
    return <div className="text-xs text-slate-400">Loading divisions…</div>;
  }

  if (!subOrgs.length) {
    return (
      <div className="text-xs text-slate-400">
        No divisions yet for this organization
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <span className="text-xs uppercase tracking-wide text-slate-500">
        Division
      </span>
      <select
        value={activeSubOrg?.id ?? ""}
        onChange={(e) => {
          const sub = subOrgs.find((s) => s.id === e.target.value) ?? null;
          setActive(sub);
        }}
        className="mt-0.5 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
      >
        {subOrgs.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}

