import { useEffect, useMemo, useState } from "react";
import { PlusCircle, Trash2, Save } from "lucide-react";

import { supabase } from "../../lib/supabaseClient";
import { useOrganizationStore } from "../../state/useOrganizationStore";
import { useSubOrganizationStore } from "../../state/useSubOrganizationStore";
import { useWhatsappTemplateStore } from "../../state/useWhatsappTemplateStore";
import type { WhatsappTemplate } from "../../types/database";

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
});

export function WhatsappTemplatesModule() {
  const { currentOrganization } = useOrganizationStore();
  const { activeSubOrg } = useSubOrganizationStore();

  const {
    templates,
    loading,
    fetchTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  } = useWhatsappTemplateStore();

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId]
  );

  const [draft, setDraft] = useState<Partial<WhatsappTemplate>>(emptyDraft());
  const [saving, setSaving] = useState(false);

  /* -------------------------------------------------------
   * Fetch templates
   * ----------------------------------------------------- */
  useEffect(() => {
    if (currentOrganization?.id) {
      fetchTemplates(currentOrganization.id);
    }
  }, [currentOrganization?.id, activeSubOrg?.id]);

  /* -------------------------------------------------------
   * Sync selected → draft
   * ----------------------------------------------------- */
  useEffect(() => {
    if (selected) setDraft(selected);
    else setDraft(emptyDraft());
  }, [selectedId]);

  /* -------------------------------------------------------
   * Save draft
   * ----------------------------------------------------- */
  async function onSave() {
    if (!currentOrganization?.id) return;
    if (draft.status !== "draft") return;

    setSaving(true);
    try {
      if (!draft.name?.trim() || !draft.body?.trim()) {
        alert("Template Name and Body are required.");
        return;
      }

      if (!selectedId) {
        const id = await createTemplate({
          ...draft,
          organization_id: currentOrganization.id,
          sub_organization_id: activeSubOrg?.id ?? null,
          status: "draft",
        } as any);

        await fetchTemplates(currentOrganization.id);
        if (id) setSelectedId(id);
      } else {
        await updateTemplate(selectedId, draft as any);
        await fetchTemplates(currentOrganization.id);
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

    if (!token) {
      alert("Not authenticated");
      return;
    }

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

    await fetchTemplates(currentOrganization!.id);
    setDraft((d) => ({ ...d, status: "pending" }));
    alert("Template submitted to WhatsApp");
  }

  /* -------------------------------------------------------
   * UI
   * ----------------------------------------------------- */
  return (
    <div className="flex h-full w-full gap-6 overflow-hidden px-6 py-6 text-slate-900">
      {/* =====================================================
       * LEFT LIST
       * =================================================== */}
      <div className="w-[360px] shrink-0 rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PlusCircle size={16} className="text-blue-600" />
            <h2 className="text-sm font-semibold">WhatsApp Templates</h2>
          </div>
          <button
            className="rounded-md border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
            onClick={() => setSelectedId(null)}
          >
            New
          </button>
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
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-slate-500">{t.status}</div>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {t.language} • {t.category}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* =====================================================
       * RIGHT EDITOR
       * =================================================== */}
      <div className="flex flex-1 flex-col gap-4 overflow-auto rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            {selectedId ? "Edit Template" : "New Template"}
          </h2>

          <div className="flex items-center gap-2">
            {selectedId && draft.status === "draft" && (
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
              disabled={saving || draft.status !== "draft"}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Save size={14} />
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        {draft.status === "draft" && selectedId && (
          <button
            onClick={onSubmitToWhatsApp}
            className="self-start rounded-md border border-green-600 bg-green-50 px-3 py-2 text-xs text-green-700 hover:bg-green-100"
          >
            Submit to WhatsApp
          </button>
        )}

        <div className="grid grid-cols-2 gap-3">
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Template name (Meta-safe, lowercase, underscores)"
            value={draft.name ?? ""}
            disabled={draft.status !== "draft"}
            onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
          />

          <select
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={draft.category ?? "MARKETING"}
            disabled={draft.status !== "draft"}
            onChange={(e) => setDraft((p) => ({ ...p, category: e.target.value }))}
          >
            <option value="MARKETING">MARKETING</option>
            <option value="UTILITY">UTILITY</option>
            <option value="AUTHENTICATION">AUTHENTICATION</option>
          </select>

          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Language (en, en_US, hi)"
            value={draft.language ?? "en"}
            disabled={draft.status !== "draft"}
            onChange={(e) => setDraft((p) => ({ ...p, language: e.target.value }))}
          />

          <select
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={draft.header_type ?? ""}
            disabled={draft.status !== "draft"}
            onChange={(e) =>
              setDraft((p) => ({
                ...p,
                header_type: e.target.value || null,
              }))
            }
          >
            <option value="">No Header</option>
            <option value="TEXT">TEXT</option>
            <option value="IMAGE">IMAGE</option>
            <option value="VIDEO">VIDEO</option>
            <option value="DOCUMENT">DOCUMENT</option>
          </select>
        </div>

        {draft.header_type === "TEXT" && (
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Header text"
            disabled={draft.status !== "draft"}
            value={draft.header_text ?? ""}
            onChange={(e) =>
              setDraft((p) => ({ ...p, header_text: e.target.value }))
            }
          />
        )}

        <textarea
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          rows={8}
          placeholder="Body (use {{1}}, {{2}} variables)"
          disabled={draft.status !== "draft"}
          value={draft.body ?? ""}
          onChange={(e) => setDraft((p) => ({ ...p, body: e.target.value }))}
        />

        <input
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="Footer (optional)"
          disabled={draft.status !== "draft"}
          value={draft.footer ?? ""}
          onChange={(e) =>
            setDraft((p) => ({ ...p, footer: e.target.value || null }))
          }
        />

        <div className="text-xs text-slate-500">
          Status: <span className="font-medium">{draft.status}</span>
          {draft.meta_template_id && (
            <span className="ml-2">
              • Meta ID: {draft.meta_template_id}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
