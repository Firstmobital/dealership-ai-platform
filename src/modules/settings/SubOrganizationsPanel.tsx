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

  return (
    <div className="flex h-full flex-col px-6 py-6 text-slate-200">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <Building2 size={20} className="text-accent" />
        <div>
          <h1 className="text-xl font-semibold text-white">
            Divisions
          </h1>
          <p className="text-sm text-slate-400">
            Manage dealership branches / divisions.
          </p>
        </div>
      </div>

      {/* Create */}
      <form
        onSubmit={handleCreate}
        className="mb-6 flex max-w-lg items-center gap-3 rounded-xl border border-white/10 bg-slate-900/60 p-4"
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New division name"
          className="flex-1 rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus size={14} />}
          Add
        </button>
      </form>

      {/* List */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
        {loading ? (
          <div className="flex items-center gap-2 text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
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
                      className="flex gap-2"
                    >
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                      />
                      <button className="bg-accent px-3 rounded-md text-white text-sm">
                        Save
                      </button>
                    </form>
                  </li>
                );
              }

              return (
                <li
                  key={sub.id}
                  className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                    isActive
                      ? "border-accent bg-accent/20 text-accent"
                      : "border-white/10 bg-slate-950"
                  }`}
                >
                  <div>
                    <p className="font-medium">{sub.name}</p>
                    {isActive && (
                      <span className="text-xs flex items-center gap-1">
                        <CheckCircle2 size={12} /> Active
                      </span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setActive(isActive ? null : sub)}
                      className="text-xs text-slate-300 hover:text-white"
                    >
                      {isActive ? "Clear" : "Set Active"}
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(sub.id);
                        setEditName(sub.name);
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => deleteSubOrg(sub.id)}
                      className="text-red-400"
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
        <div className="mt-4 flex items-center gap-2 text-red-400">
          <XCircle size={16} /> {error}
        </div>
      )}
    </div>
  );
}
