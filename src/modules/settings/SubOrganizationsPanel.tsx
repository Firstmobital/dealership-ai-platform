import { FormEvent, useEffect, useState } from "react";
import {
  Loader2,
  Pencil,
  Plus,
  Trash2,
  XCircle,
  Building2,
  CheckCircle2,
} from "lucide-react";

import { useOrganizationStore } from "../../state/useOrganizationStore";
import {
  useSubOrganizationStore,
  type SubOrganization,
} from "../../state/useSubOrganizationStore";

export function SubOrganizationsPanel() {
  const { currentOrganization } = useOrganizationStore();
  const {
    subOrgs,
    activeSubOrg,
    loading,
    saving,
    error,
    fetchSubOrgs,
    createSubOrg,
    updateSubOrg,
    deleteSubOrg,
    setActive,
    clearError,
  } = useSubOrganizationStore();

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  /* ------------------------------------------------------------------ */
  /* LOAD                                                               */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (!currentOrganization) return;
    fetchSubOrgs(currentOrganization.id).catch(console.error);
  }, [currentOrganization?.id, fetchSubOrgs]);

  /* ------------------------------------------------------------------ */
  /* ACTIONS                                                            */
  /* ------------------------------------------------------------------ */

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    if (!newName.trim()) return;
    await createSubOrg(newName.trim());
    setNewName("");
  };

  const handleStartEdit = (subOrg: SubOrganization) => {
    clearError();
    setEditingId(subOrg.id);
    setEditName(subOrg.name);
  };

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingId || !editName.trim()) return;
    clearError();
    await updateSubOrg(editingId, editName.trim());
    setEditingId(null);
    setEditName("");
  };

  const handleDelete = async (id: string) => {
    clearError();
    if (!window.confirm("Delete this division?")) return;
    await deleteSubOrg(id);
  };

  const handleSetActive = (subOrg: SubOrganization | null) => {
    clearError();
    setActive(subOrg);
  };

  /* ------------------------------------------------------------------ */
  /* UI                                                                 */
  /* ------------------------------------------------------------------ */

  return (
    <div className="flex h-full flex-col px-6 py-6 text-slate-200">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Building2 size={20} className="text-accent" />
        <div>
          <h1 className="text-xl font-semibold text-white">Divisions</h1>
          <p className="text-sm text-slate-400">
            Manage dealership branches / divisions under this organization.
          </p>
        </div>
      </div>

      {!currentOrganization ? (
        <div className="mt-10 text-slate-500">
          Select an organization to manage divisions.
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {/* Create */}
          <form
            onSubmit={handleCreate}
            className="flex max-w-lg gap-3 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3"
          >
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New division name (e.g. Jaipur Sales)"
              disabled={saving}
              className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </button>
          </form>

          {/* List */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
            {loading ? (
              <div className="flex items-center gap-2 text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : (
              <ul className="space-y-3">
                {subOrgs.map((subOrg) => {
                  const isActive = activeSubOrg?.id === subOrg.id;
                  const isEditing = editingId === subOrg.id;

                  if (isEditing) {
                    return (
                      <li key={subOrg.id}>
                        <form
                          onSubmit={handleSaveEdit}
                          className="flex gap-3 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3"
                        >
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                          />
                          <button className="bg-accent px-3 py-1.5 text-xs rounded-md text-white">
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="text-slate-400"
                          >
                            <XCircle size={14} />
                          </button>
                        </form>
                      </li>
                    );
                  }

                  return (
                    <li key={subOrg.id}>
                      <div
                        className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                          isActive
                            ? "border-accent bg-accent/15 text-accent"
                            : "border-slate-700 bg-slate-950"
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{subOrg.name}</span>
                            {isActive && (
                              <span className="flex items-center gap-1 text-[10px] uppercase">
                                <CheckCircle2 size={12} /> Active
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500">
                            ID: {subOrg.id.slice(0, 8)}…
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleSetActive(isActive ? null : subOrg)}
                            className="text-xs border px-2 py-1 rounded-md"
                          >
                            {isActive ? "Clear" : "Set Active"}
                          </button>
                          <button onClick={() => handleStartEdit(subOrg)}>
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(subOrg.id)}
                            className="text-red-400"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-300">
              <XCircle size={14} /> {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
