import { useEffect } from "react";
import { useOrganizationStore } from "../../state/useOrganizationStore";
import { useSubOrgStore } from "../../state/useSubOrgStore";

export function SubOrgSwitcher() {
  const { activeOrganization } = useOrganizationStore();
  const { list, active, fetchSubOrgs, setActive } = useSubOrgStore();

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
        value={active?.id ?? ""}
        onChange={(e) => {
          const sub = list.find((s) => s.id === e.target.value) ?? null;
          setActive(sub);
        }}
        className="rounded-md bg-slate-800 text-white text-sm px-2 py-1 border border-slate-700"
      >
        {list.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}
