// src/components/topbar/SubOrgSwitcher.tsx

import { useEffect } from "react";
import { useOrganizationStore } from "../../state/useOrganizationStore";
import { useSubOrganizationStore } from "../../state/useSubOrganizationStore";

export function SubOrgSwitcher() {
  const { currentOrganization } = useOrganizationStore();
  const { subOrgs, activeSubOrg, fetchSubOrgs, setActive, loading } =
    useSubOrganizationStore();

  // Load divisions whenever org changes
  useEffect(() => {
    if (currentOrganization?.id) {
      fetchSubOrgs(currentOrganization.id).catch(console.error);
    }
  }, [currentOrganization?.id]);

  if (!currentOrganization) {
    return (
      <div className="text-xs text-slate-500 dark:text-slate-400">
        Select org to load divisions
      </div>
    );
  }

  if (loading && !subOrgs.length) {
    return (
      <div className="text-xs text-slate-500 dark:text-slate-400">
        Loading divisions…
      </div>
    );
  }

  if (!subOrgs.length) {
    return (
      <div className="text-xs text-slate-500 dark:text-slate-400">
        No divisions
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Division
      </span>

      <select
        value={activeSubOrg?.id ?? ""}
        onChange={(e) => {
          const sub = subOrgs.find((s) => s.id === e.target.value) ?? null;
          setActive(sub);
        }}
        className="mt-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm
                   focus:border-accent focus:outline-none 
                   dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
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
