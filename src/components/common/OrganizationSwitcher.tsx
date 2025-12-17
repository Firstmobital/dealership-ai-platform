// src/components/common/OrganizationSwitcher.tsx

import { useEffect } from "react";
import { Building2 } from "lucide-react";
import { useOrganizationStore } from "../../state/useOrganizationStore";
import { useSubOrganizationStore } from "../../state/useSubOrganizationStore";

export function OrganizationSwitcher() {
  const {
    organizations,
    currentOrganization,
    fetchOrganizations,
    switchOrganization,
  } = useOrganizationStore();

  const { setActive } = useSubOrganizationStore();

  useEffect(() => {
    if (!organizations.length) {
      fetchOrganizations().catch(console.error);
    }
  }, [organizations.length, fetchOrganizations]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const orgId = e.target.value;
    if (!orgId) return;

    switchOrganization(orgId);
    setActive(null); // 🔑 clear division when org changes
  };

  if (!organizations.length) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
        <Building2 size={14} className="text-accent" />
        Loading organizations…
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <span className="text-xs uppercase tracking-wide text-slate-500">
        Organization
      </span>

      <div className="mt-1 flex items-center gap-2">
        <Building2 size={16} className="text-accent" />

        <select
          value={currentOrganization?.id ?? ""}
          onChange={handleChange}
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900
                     focus:border-accent focus:outline-none"
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
