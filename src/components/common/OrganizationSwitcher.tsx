import { useEffect } from 'react';
import { Building2 } from 'lucide-react';
import { useOrganizationStore } from '../../state/useOrganizationStore';

export function OrganizationSwitcher() {
  const { organizations, currentOrganization, fetchOrganizations, switchOrganization } = useOrganizationStore();

  useEffect(() => {
    if (!organizations.length) {
      fetchOrganizations().catch(console.error);
    }
  }, [organizations.length, fetchOrganizations]);

  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/20 text-accent">
        <Building2 />
      </div>
      <div>
        <label className="text-xs uppercase tracking-wide text-slate-400">Organization</label>
        <select
          className="mt-1 w-56 rounded-md border border-white/10 bg-slate-900 px-3 py-1.5 text-sm text-white focus:border-accent focus:outline-none"
          value={currentOrganization?.id ?? ''}
          onChange={(event) => switchOrganization(event.target.value)}
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
