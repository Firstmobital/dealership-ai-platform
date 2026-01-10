import { useEffect, useMemo, useState } from "react";
import { PlusCircle, Trash2, Save, RefreshCw } from "lucide-react";

import { supabase } from "../../lib/supabaseClient";
import { useOrganizationStore } from "../../state/useOrganizationStore";
import { useWhatsappTemplateStore } from "../../state/useWhatsappTemplateStore";
import type { WhatsappTemplate } from "../../types/database";

/* -------------------------------------------------------
 * Variable helpers
 * ----------------------------------------------------- */
function extractVariableIndices(text: string | null): number[] {
  if (!text) return [];
  const matches = [...text.matchAll(/\{\{(\d+)\}\}/g)];
  const indices = matches.map((m) => Number(m[1]));
  return Array.from(new Set(indices)).sort((a, b) => a - b);
}


/* -------------------------------------------------------
 * Helpers
 * ----------------------------------------------------- */
const emptyDraft = (): Partial<WhatsappTemplate> => ({
  name: "",
  category: "MARKETING",
  language: "en",
  header_type: null,
  header_text: null,
  body: "",
  footer: null,
  status: "draft",

  // ✅ VARIABLE TEMPLATE SCHEMA DEFAULTS
  header_variable_count: 0,
  header_variable_indices: null,
  body_variable_count: 0,
  body_variable_indices: null,
});


export function WhatsappTemplatesModule() {
  const { activeOrganization } = useOrganizationStore();

  const {
    templates,
    loading,
    fetchTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  } = useWhatsappTemplateStore();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<WhatsappTemplate>>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const selected = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId]
  );

  /* -------------------------------------------------------
   * Fetch templates
   * ----------------------------------------------------- */
  useEffect(() => {
    if (activeOrganization?.id) {
      fetchTemplates(); // ✅ FIXED
    }
  }, [activeOrganization?.id, fetchTemplates]);

  /* -------------------------------------------------------
   * Sync selected → draft
   * ----------------------------------------------------- */
  useEffect(() => {
    if (selected) setDraft(selected);
    else setDraft(emptyDraft());
  }, [selected]);

  /* -------------------------------------------------------
   * Save draft
   * ----------------------------------------------------- */
  async function onSave() {
    if (!activeOrganization?.id) return;
    if (draft.status !== "draft") return;

    if (!draft.name?.trim() || !draft.body?.trim()) {
      alert("Template name and body are required.");
      return;
    }

        /* ---------------------------------------------
     * VARIABLE TEMPLATE SCHEMA COMPUTATION
     * ------------------------------------------- */
        const headerVars =
        draft.header_type === "TEXT"
          ? extractVariableIndices(draft.header_text ?? null)
          : [];
  
      const bodyVars = extractVariableIndices(draft.body ?? null);
  
      const schemaPatch = {
        header_variable_count: headerVars.length,
        header_variable_indices:
          headerVars.length > 0 ? headerVars : null,
  
        body_variable_count: bodyVars.length,
        body_variable_indices:
          bodyVars.length > 0 ? bodyVars : null,
      };
  

    setSaving(true);
    try {
      if (!selectedId) {
        const id = await createTemplate({
          ...draft,
          ...schemaPatch,
          organization_id: activeOrganization.id,
          status: "draft",
        } as any);        

        await fetchTemplates(); // ✅ FIXED
        if (id) setSelectedId(id);
      } else {
        await updateTemplate(selectedId, {
          ...draft,
          ...schemaPatch,
        } as any);        
        await fetchTemplates(); // ✅ FIXED
      }
    } finally {
      setSaving(false);
    }
  }

  /* -------------------------------------------------------
   * Delete draft
   * ----------------------------------------------------- */
  async function onDelete() {
    if (!selectedId) return;
    if (draft.status !== "draft") return;
    if (!confirm("Delete this template?")) return;

    await deleteTemplate(selectedId);
    setSelectedId(null);
    setDraft(emptyDraft());
  }

  /* -------------------------------------------------------
   * Submit to WhatsApp
   * ----------------------------------------------------- */
  async function onSubmitToWhatsApp() {
    if (!selectedId) return;
    if (draft.status !== "draft") return;
    if (!confirm("Submit this template to WhatsApp for approval?")) return;

    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) return alert("Not authenticated");

    await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-template-submit`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ template_id: selectedId }),
      }
    );

    await fetchTemplates(); // ✅ FIXED
    setDraft((d) => ({ ...d, status: "pending" }));
    alert("Template submitted to WhatsApp");
  }

  /* -------------------------------------------------------
   * Sync template status from Meta
   * ----------------------------------------------------- */
  async function onSyncFromMeta() {
    if (!activeOrganization?.id) return;

    setSyncing(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) return alert("Not authenticated");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-template-sync`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            organization_id: activeOrganization.id,
          }),
        }
      );

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error(json);
        alert("Sync failed");
        return;
      }

      await fetchTemplates(); // ✅ FIXED
      alert(`Synced templates. Updated: ${json.updated ?? 0}`);
    } finally {
      setSyncing(false);
    }
  }

  const isEditable = draft.status === "draft";

  /* -------------------------------------------------------
   * UI
   * ----------------------------------------------------- */
  return (
    <div className="flex h-full w-full gap-6 overflow-hidden px-6 py-6 text-slate-900">
      {/* LEFT LIST */}
      <div className="w-[360px] shrink-0 rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PlusCircle size={16} className="text-blue-600" />
            <h2 className="text-sm font-semibold">WhatsApp Templates</h2>
          </div>

          <div className="flex gap-2">
            <button
              onClick={onSyncFromMeta}
              disabled={syncing}
              className="rounded-md border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw size={12} />
            </button>
            <button
              className="rounded-md border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
              onClick={() => setSelectedId(null)}
            >
              New
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-slate-500">Loading…</div>
        ) : templates.length === 0 ? (
          <div className="text-sm text-slate-500">No templates yet.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={`rounded-md border px-3 py-2 text-left text-sm ${
                  selectedId === t.id
                    ? "border-blue-300 bg-blue-50"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <div className="flex justify-between">
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs">{t.status}</div>
                </div>
                <div className="text-xs text-slate-500">
                  {t.language} • {t.category}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* RIGHT EDITOR */}
      <div className="flex flex-1 flex-col gap-4 overflow-auto rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex justify-between">
          <h2 className="text-sm font-semibold">
            {selectedId ? "Edit Template" : "New Template"}
          </h2>

          <div className="flex gap-2">
            {selectedId && isEditable && (
              <button
                onClick={onDelete}
                className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 hover:bg-red-100"
              >
                <Trash2 size={14} />
                Delete
              </button>
            )}

            <button
              onClick={onSave}
              disabled={!isEditable || saving}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Save size={14} />
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        {isEditable && selectedId && (
          <button
            onClick={onSubmitToWhatsApp}
            className="self-start rounded-md border border-green-600 bg-green-50 px-3 py-2 text-xs text-green-700 hover:bg-green-100"
          >
            Submit to WhatsApp
          </button>
        )}

        <input
          className="rounded-md border px-3 py-2 text-sm"
          placeholder="Template name (lowercase, underscores)"
          disabled={!isEditable}
          value={draft.name ?? ""}
          onChange={(e) =>
            setDraft((p) => ({ ...p, name: e.target.value }))
          }
        />

        <textarea
          className="rounded-md border px-3 py-2 text-sm"
          rows={8}
          placeholder="Body (use {{1}}, {{2}} variables)"
          disabled={!isEditable}
          value={draft.body ?? ""}
          onChange={(e) =>
            setDraft((p) => ({ ...p, body: e.target.value }))
          }
        />

        <div className="text-xs text-slate-500">
          Status: <b>{draft.status}</b>
          {draft.meta_template_id && (
            <span className="ml-2">• Meta ID: {draft.meta_template_id}</span>
          )}
        </div>
      </div>
    </div>
  );
}
