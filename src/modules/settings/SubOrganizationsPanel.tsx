// src/modules/settings/SubOrganizationsPanel.tsx

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

  // Load sub-orgs whenever the current parent org changes
  useEffect(() => {
    if (!currentOrganization) return;
    fetchSubOrgs(currentOrganization.id).catch(console.error);
  }, [currentOrganization?.id, fetchSubOrgs]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    clearError();

    if (!newName.trim()) return;

    await createSubOrg(newName.trim());
    // optimistic clear – error (if any) will still be shown in the banner
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

  return (
    <div className="flex h-full flex-col px-6 py-6 text-slate-200">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Building2 size={20} className="text-accent" />
        <div>
          <h1 className="text-xl font-semibold text-white">Divisions</h1>
          <p className="text-sm text-slate-400">
            Create and manage divisions (sub-organizations) within this
            organization.
          </p>
        </div>
      </div>

      {/* No org selected */}
      {!currentOrganization ? (
        <div className="mt-10 flex items-center justify-center text-slate-500">
          Select an organization to manage its divisions.
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {/* Create new division */}
          <form
            onSubmit={handleCreate}
            className="flex max-w-lg items-center gap-3 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3"
          >
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              disabled={saving}
              placeholder="New division name (e.g. Andheri Branch)"
              className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Add
                </>
              )}
            </button>
          </form>

          {/* Divisions list */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-200">
                  Divisions for{" "}
                  <span className="text-accent">
                    {currentOrganization.name}
                  </span>
                </h2>
                <p className="text-xs text-slate-500">
                  {loading
                    ? "Loading divisions..."
                    : subOrgs.length
                    ? "Select a division to scope chats, WhatsApp, and campaigns."
                    : "No divisions yet. Create your first division above."}
                </p>
              </div>
            </div>

            {loading ? (
              <div className="mt-6 flex items-center gap-2 text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading divisions...
              </div>
            ) : (
              <ul className="mt-4 space-y-3">
                {subOrgs.map((subOrg) => {
                  const isActive = activeSubOrg?.id === subOrg.id;
                  const isEditing = editingId === subOrg.id;

                  if (isEditing) {
                    return (
                      <li key={subOrg.id}>
                        <form
                          onSubmit={handleSaveEdit}
                          className="flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3"
                        >
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            disabled={saving}
                            className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-accent focus:outline-none"
                          />

                          <div className="flex items-center gap-2">
                            <button
                              type="submit"
                              disabled={saving}
                              className="inline-flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                            >
                              {saving ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                "Save"
                              )}
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => {
                                setEditingId(null);
                                setEditName("");
                              }}
                              className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                            >
                              <XCircle className="h-3 w-3" />
                              Cancel
                            </button>
                          </div>
                        </form>
                      </li>
                    );
                  }

                  return (
                    <li key={subOrg.id}>
                      <div
                        className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition ${
                          isActive
                            ? "border-accent bg-accent/15 text-accent"
                            : "border-slate-700 bg-slate-950 hover:bg-slate-900 text-slate-200"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800/70">
                            <Building2 className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">
                                {subOrg.name}
                              </span>
                              {isActive && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Active
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500">
                              Division ID: {subOrg.id.slice(0, 8)}…
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              handleSetActive(isActive ? null : subOrg)
                            }
                            className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-[11px] text-slate-200 hover:bg-slate-800"
                          >
                            {isActive ? "Clear active" : "Set active"}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleStartEdit(subOrg)}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] text-slate-300 hover:bg-slate-800"
                          >
                            <Pencil className="h-3 w-3" />
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDelete(subOrg.id)}
                            className="inline-flex items-center justify-center rounded-md px-2 py-1.5 text-[11px] text-red-400 hover:bg-red-500/10"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}

                {!subOrgs.length && (
                  <li className="rounded-xl border border-dashed border-slate-700 bg-slate-950 px-4 py-4 text-sm text-slate-400">
                    No divisions created yet. Use the form above to add your
                    first division.
                  </li>
                )}
              </ul>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              <XCircle size={16} />
              <span>{error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

