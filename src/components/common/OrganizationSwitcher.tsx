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

  // Load organizations once on mount
  useEffect(() => {
    if (!organizations.length) {
      fetchOrganizations().catch(console.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const orgId = e.target.value;
    if (!orgId) return;

    // Switch selected parent org
    switchOrganization(orgId);

    // Reset selected sub-organization
    switchSubOrganization(null);
  };

  if (!organizations.length) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-400">
        <Building2 size={14} className="text-accent" />
        <span>Loading organizations…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <span className="text-xs font-medium text-slate-400">
        Organization
      </span>

      <div className="mt-0.5 flex items-center gap-2">
        <Building2 size={16} className="text-accent" />

        <select
          value={currentOrganization?.id ?? ""}
          onChange={handleChange}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 shadow-sm focus:border-accent focus:outline-none"
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
