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
  /* LOAD DIVISIONS                                                      */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    if (!currentOrganization) return;
    fetchSubOrgs(currentOrganization.id).catch(console.error);
  }, [currentOrganization?.id]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    if (!newName.trim()) return;
    await createSubOrg(newName.trim());
    setNewName("");
  };

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingId || !editName.trim()) return;
    clearError();
    await updateSubOrg(editingId, editName.trim());
    setEditingId(null);
    setEditName("");
  };

  /* ------------------------------------------------------------------ */
  /* UI                                                                 */
  /* ------------------------------------------------------------------ */
  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="mt-1">
          <Building2 size={20} className="text-accent" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Divisions
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage dealership branches / divisions under this organization.
          </p>
        </div>
      </div>

      {/* Create Division */}
      <form
        onSubmit={handleCreate}
        className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4"
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New division name (e.g. Jaipur Sales)"
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus size={14} />
          )}
          Add
        </button>
      </form>

      {/* Divisions List */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading divisions…
          </div>
        ) : subOrgs.length === 0 ? (
          <p className="text-sm text-slate-500">
            No divisions created yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {subOrgs.map((sub) => {
              const isActive = activeSubOrg?.id === sub.id;
              const isEditing = editingId === sub.id;

              if (isEditing) {
                return (
                  <li key={sub.id}>
                    <form
                      onSubmit={handleSaveEdit}
                      className="flex items-center gap-2"
                    >
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setEditName("");
                        }}
                        className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                    </form>
                  </li>
                );
              }

              return (
                <li
                  key={sub.id}
                  className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                    isActive
                      ? "border-accent bg-accent/10"
                      : "border-slate-200"
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {sub.name}
                    </p>
                    {isActive && (
                      <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-accent">
                        <CheckCircle2 size={12} />
                        Active
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-sm">
                    <button
                      onClick={() => setActive(isActive ? null : sub)}
                      className="text-slate-600 hover:text-slate-900"
                    >
                      {isActive ? "Clear" : "Set Active"}
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(sub.id);
                        setEditName(sub.name);
                      }}
                      className="text-slate-600 hover:text-slate-900"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => deleteSubOrg(sub.id)}
                      className="text-red-500 hover:text-red-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-500">
          <XCircle size={16} />
          {error}
        </div>
      )}
    </div>
  );
}
