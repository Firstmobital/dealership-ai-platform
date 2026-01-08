import { Building2, Plus, X } from "lucide-react";
import { useOrganizationStore } from "../../state/useOrganizationStore";
import { useMemo, useState, type ChangeEvent } from "react";

export function OrganizationSwitcher() {
  const {
    organizations,
    activeOrganization,
    setActiveOrganization,
    createOrganization,
  } = useOrganizationStore();

  const [createOpen, setCreateOpen] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [creating, setCreating] = useState(false);

  const canCreate = useMemo(() => orgName.trim().length >= 2, [orgName]);

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

        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
          title="Add organization"
        >
          <Plus size={14} />
          New
        </button>
      </div>

      {/* Create Organization Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <div className="text-sm font-semibold text-slate-900">New Organization</div>
                <div className="text-xs text-slate-500">Create a dealership workspace and switch into it.</div>
              </div>
              <button
                onClick={() => {
                  if (creating) return;
                  setCreateOpen(false);
                }}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-5 py-4">
              <label className="text-xs font-medium text-slate-600">Organization name</label>
              <input
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="e.g. Techwheels Motors"
                className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                onClick={() => {
                  if (creating) return;
                  setCreateOpen(false);
                }}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                disabled={!canCreate || creating}
                onClick={async () => {
                  if (!canCreate) return;
                  setCreating(true);
                  try {
                    await createOrganization(orgName);
                    setOrgName("");
                    setCreateOpen(false);
                  } finally {
                    setCreating(false);
                  }
                }}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
