// src/components/common/OrganizationSwitcher.tsx

import { useEffect } from "react";
import { Building2 } from "lucide-react";
import { useOrganizationStore } from "../../state/useOrganizationStore";

export function OrganizationSwitcher() {
  const {
    organizations,
    currentOrganization,
    fetchOrganizations,
    switchOrganization,
    switchSubOrganization,
  } = useOrganizationStore();

  // Load orgs initially
  useEffect(() => {
    if (!organizations.length) {
      fetchOrganizations().catch(console.error);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const orgId = e.target.value;
    if (!orgId) return;

    switchOrganization(orgId);
    switchSubOrganization(null); // reset division on org switch
  };

  if (!organizations.length) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-500
                      dark:border-white/10 dark:bg-slate-800 dark:text-slate-400">
        <Building2 size={14} className="text-accent" />
        Loading organizations…
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Organization
      </span>

      <div className="mt-1 flex items-center gap-2">
        <Building2 size={16} className="text-accent" />

        <select
          value={currentOrganization?.id ?? ""}
          onChange={handleChange}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-sm
                     focus:border-accent focus:outline-none 
                     dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
        >
          <option value="" disabled>
            Select organization
          </option>

          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
