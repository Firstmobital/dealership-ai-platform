import { Building2 } from "lucide-react";
import { useOrganizationStore } from "../../state/useOrganizationStore";
import type { ChangeEvent } from "react";

export function OrganizationSwitcher() {
  const {
    organizations,
    activeOrganization,
    setActiveOrganization,
  } = useOrganizationStore();

  /* -------------------------------------------------------------------------- */
  /* HANDLE ORG CHANGE                                                          */
  /* -------------------------------------------------------------------------- */
  const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const orgId = e.target.value;
    if (!orgId) return;

    const org = organizations.find((o) => o.id === orgId);
    if (!org) return;

    setActiveOrganization(org).catch(console.error);
  };

  /* -------------------------------------------------------------------------- */
  /* LOADING STATE                                                              */
  /* -------------------------------------------------------------------------- */
  if (!organizations.length) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
        <Building2 size={14} className="text-accent" />
        Loading organizations…
      </div>
    );
  }

  /* -------------------------------------------------------------------------- */
  /* RENDER                                                                     */
  /* -------------------------------------------------------------------------- */
  return (
    <div className="flex flex-col">
      <span className="text-xs uppercase tracking-wide text-slate-500">
        Organization
      </span>

      <div className="mt-1 flex items-center gap-2">
        <Building2 size={16} className="text-accent" />

        <select
          value={activeOrganization?.id ?? ""}
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
