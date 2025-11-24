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
  } = useOrganizationStore();

  useEffect(() => {
    if (!organizations.length) {
      fetchOrganizations().catch(console.error);
    }
  }, [organizations.length, fetchOrganizations]);

  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/20 text-accent">
        <Building2 size={20} />
      </div>
      <div className="flex flex-col">
        <span className="text-xs uppercase tracking-wide text-slate-500">
          Organization
        </span>
        <select
          value={currentOrganization?.id ?? ""}
          onChange={(e) => switchOrganization(e.target.value)}
          className="mt-0.5 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
        >
          <option value="" disabled>
            Select organization
          </option>
          {organizations.map((organization) => (
            <option key={organization.id} value={organization.id}>
              {organization.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
