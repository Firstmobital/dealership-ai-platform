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

  useEffect(() => {
    if (currentOrganization?.id) {
      fetchSubOrgs(currentOrganization.id).catch(console.error);
    }
  }, [currentOrganization?.id, fetchSubOrgs]);

  if (!currentOrganization) {
    return (
      <div className="text-xs text-slate-500">
        Select organization first
      </div>
    );
  }

  if (loading && !subOrgs.length) {
    return (
      <div className="text-xs text-slate-500">
        Loading divisions…
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
          const value = e.target.value;
          const sub = subOrgs.find((s) => s.id === value) ?? null;
          setActive(sub);
        }}
        className="mt-1 rounded-md border border-slate-200 bg-white px-2 py-1
                   text-xs text-slate-900 focus:border-accent focus:outline-none"
      >
        <option value="">All divisions</option>

        {subOrgs.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}
