import { useEffect, useState } from "react";
import { PlusCircle, Loader2 } from "lucide-react";
import { useOrganizationStore } from "../../state/useOrganizationStore";
import { useSubOrganizationStore } from "../../state/useSubOrganizationStore";

export function SubOrganizationsPanel() {
  const { currentOrganization } = useOrganizationStore();
  const { subOrgs, loading, fetchSubOrgs, createSubOrg } =
    useSubOrganizationStore();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (currentOrganization?.id) {
      fetchSubOrgs(currentOrganization.id).catch((err) =>
        console.error("[SubOrganizationsPanel] fetchSubOrgs error", err)
      );
    }
  }, [currentOrganization?.id]);

  const handleCreate = async () => {
    if (!currentOrganization?.id) return;
    if (!name.trim()) return;

    setCreating(true);
    try {
      await createSubOrg({
        organization_id: currentOrganization.id,
        name: name.trim(),
        description: description.trim() || undefined,
      });
      setName("");
      setDescription("");
    } catch (err) {
      console.error("[SubOrganizationsPanel] createSubOrg error", err);
    } finally {
      setCreating(false);
    }
  };

  if (!currentOrganization) {
    return (
      <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4 text-sm text-slate-400">
        Select an organization to manage sub-units.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">
            Departments / Sub-organizations
          </h2>
          <p className="text-xs text-slate-400">
            Create internal divisions like Sales, Service, Finance, etc.
          </p>
        </div>
      </div>

      {/* Create form */}
      <div className="space-y-2 rounded-lg bg-slate-950/60 p-3">
        <input
          className="w-full rounded bg-slate-800 px-3 py-2 text-sm"
          placeholder="Sub-organization name (e.g. Sales, Service)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <textarea
          className="w-full rounded bg-slate-800 px-3 py-2 text-xs"
          placeholder="Optional description"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button
          onClick={handleCreate}
          disabled={creating || !name.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
        >
          {creating ? <Loader2 size={14} className="animate-spin" /> : <PlusCircle size={14} />}
          Add sub-organization
        </button>
      </div>

      {/* List */}
      <div className="space-y-2">
        {loading && (
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <Loader2 size={12} className="animate-spin" />
            Loading sub-organizations...
          </div>
        )}

        {subOrgs.map((sub) => (
          <div
            key={sub.id}
            className="flex items-center justify-between rounded-lg bg-slate-950/60 px-3 py-2 text-xs"
          >
            <div>
              <div className="font-semibold text-slate-100">{sub.name}</div>
              {sub.description && (
                <div className="text-slate-400">{sub.description}</div>
              )}
            </div>
            <div className="text-[10px] text-slate-500">
              {sub.slug}
            </div>
          </div>
        ))}

        {!loading && subOrgs.length === 0 && (
          <div className="text-xs text-slate-500">
            No sub-organizations yet. Create Sales / Service / Finance to begin.
          </div>
        )}
      </div>
    </div>
  );
}
