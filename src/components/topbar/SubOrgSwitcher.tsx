import { useEffect } from "react";
import { useOrganizationStore } from "../../state/useOrganizationStore";
import { useSubOrganizationStore } from "../../state/useSubOrganizationStore";

export function SubOrgSwitcher() {
  const { activeOrganization } = useOrganizationStore();

  const {
    subOrgs,
    activeSubOrg,
    fetchSubOrgs,
    setActive,
    loading,
  } = useSubOrganizationStore();

  // Load sub-orgs when organization changes
  useEffect(() => {
    if (activeOrganization?.id) {
      fetchSubOrgs(activeOrganization.id);
    }
  }, [activeOrganization?.id]);

  if (!activeOrganization) return null;

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-gray-400">Division:</label>

      <select
        disabled={loading}
        value={activeSubOrg?.id ?? ""}
        onChange={(e) => {
          const sub = subOrgs.find((s) => s.id === e.target.value) ?? null;
          setActive(sub);
        }}
        className="rounded-md bg-slate-800 text-white text-sm px-2 py-1 border border-slate-700"
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
