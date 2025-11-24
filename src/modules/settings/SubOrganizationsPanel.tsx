// src/modules/settings/SubOrganizationsPanel.tsx

import { useEffect, useState } from "react";
import {
  Loader2,
  Pencil,
  Plus,
  Trash2,
  XCircle,
  Building2,
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

  // Load sub-orgs when organization changes
  useEffect(() => {
    if (!currentOrganization) return;
    fetchSubOrgs(currentOrganization.id).catch(console.error);
  }, [currentOrganization?.id]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    await createSubOrg(newName);
    setNewName("");
  };

  const startEdit = (sub: SubOrganization) => {
    setEditingId(sub.id);
    setEditName(sub.name);
    clearError();
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    clearError();
    await updateSubOrg(editingId, editName);
    setEditingId(null);
    setEditName("");
  };

  const handleDelete = async (id: string) => {
    clearError();
    if (!window.confirm("Delete this division?")) return;
    await deleteSubOrg(id);
  };

  return (
    <div className="flex h-full flex-col px-6 py-6 text-slate-200">
      <div>
        <h1 className="text-xl font-semibold text-white">Divisions</h1>
        <p className="text-sm text-slate-400">
          Create and manage divisions (sub-organizations) within this organization.
        </p>
      </div>

      {!currentOrganization ? (
        <div className="mt-10 flex items-center justify-center text-slate-500">
          Select an organization to manage its divisions.
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {/* Create new division */}
          <form
            onSubmit={handleCreate}
            className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 max-w-lg"
          >
            <input
              type="text"
              value={newName}
              disabled={saving}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New division name"
              className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
            />

            <button
              type="submit"
              disabled={saving || !newName.trim()}
              className="flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Plus size={16} />
              )}
              Add
            </button>
          </form>

          {/* List of divisions */}
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
              <Building2 size={16} />
              Divisions ({subOrgs.length})
            </h2>

            {loading ? (
              <div className="flex items-center gap-2 py-6 text-slate-400">
                <Loader2 className="animate-spin" size={16} />
                Loading divisions...
              </div>
            ) : subOrgs.length === 0 ? (
              <p className="py-4 text-sm text-slate-500">
                No divisions created yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {subOrgs.map((sub) => {
                  const isEditing = editingId === sub.id;
                  const isActive = activeSubOrg?.id === sub.id;

                  return (
                    <li
                      key={sub.id}
                      className={`rounded-lg border px-4 py-3 transition ${
                        isActive
                          ? "border-accent bg-accent/20 text-accent"
                          : "border-slate-700 bg-slate-950 hover:bg-slate-800 text-slate-300"
                      }`}
                    >
                      {isEditing ? (
                        // EDIT MODE
                        <form
                          onSubmit={handleEdit}
                          className="flex items-center justify-between gap-4"
                        >
                          <input
                            type="text"
                            value={editName}
                            disabled={saving}
                            onChange={(e) => setEditName(e.target.value)}
                            className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
                          />

                          <div className="flex items-center gap-3">
                            <button
                              type="submit"
                              disabled={saving}
                              className="rounded-md bg-accent/80 px-3 py-1 text-xs text-white disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => {
                                setEditingId(null);
                                setEditName("");
                              }}
                              className="text-slate-400 hover:text-slate-200"
                            >
                              <XCircle size={18} />
                            </button>
                          </div>
                        </form>
                      ) : (
                        // VIEW MODE
                        <div className="flex items-center justify-between">
                          <div
                            className="flex-1 cursor-pointer"
                            onClick={() => setActive(sub)}
                          >
                            <p className="font-medium">{sub.name}</p>
                            <p className="text-xs text-slate-400">
                              ID: {sub.id}
                            </p>
                          </div>

                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => startEdit(sub)}
                              className="text-slate-400 hover:text-slate-200"
                            >
                              <Pencil size={16} />
                            </button>

                            <button
                              onClick={() => handleDelete(sub.id)}
                              className="text-slate-400 hover:text-red-400"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              <XCircle size={16} /> {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
