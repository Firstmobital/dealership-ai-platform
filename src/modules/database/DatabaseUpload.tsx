// src/modules/database/DatabaseUpload.tsx
// FULL + FINAL — Tier 5
// Clean CRM-style upload modal
// Logic untouched

import { useState } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useOrganizationStore } from "../../state/useOrganizationStore";

type ParsedRow = {
  phone: string;
  first_name?: string;
  last_name?: string;
  model?: string;
};

function parseCsv(text: string): ParsedRow[] {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1);

  return rows.map((line) => {
    const values = line.split(",");
    const obj: any = {};
    headers.forEach((h, i) => (obj[h] = values[i]?.trim()));
    return obj;
  });
}

export function DatabaseUpload({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const { currentOrganization } = useOrganizationStore();

  const [raw, setRaw] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(false);

  const preview = rows.slice(0, 5);

  const handleParse = () => {
    try {
      const parsed = parseCsv(raw);
      setRows(parsed);
    } catch {
      alert("Invalid CSV format");
    }
  };

  const handleUpload = async () => {
    if (!currentOrganization?.id) return;
    if (rows.length === 0) return alert("No rows to import");

    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke(
        "contact-bulk-upload",
        {
          body: {
            organization_id: currentOrganization.id,
            rows,
            label: label || null,
          },
        },
      );

      if (error) throw error;
      onDone();
      onClose();
    } catch (err) {
      console.error("contact upload failed", err);
      alert("Upload failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[640px] max-w-full rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
        {/* HEADER */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            Upload Contacts
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>

        {/* CSV INPUT */}
        <textarea
          className="w-full rounded-md border border-slate-300 bg-white p-3 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={6}
          placeholder="Paste CSV here (must include phone column)"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
        />

        {/* ACTIONS */}
        <div className="mt-3 flex gap-3">
          <button
            onClick={handleParse}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
          >
            Preview
          </button>

          <input
            placeholder="Optional tag (eg: legacy_import)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs"
          />
        </div>

        {/* PREVIEW */}
        {preview.length > 0 && (
          <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  {Object.keys(preview[0]).map((h) => (
                    <th
                      key={h}
                      className="px-2 py-2 text-left font-medium text-slate-600"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i} className="border-t border-slate-200">
                    {Object.values(r).map((v, j) => (
                      <td key={j} className="px-2 py-1.5 text-slate-700">
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* SUBMIT */}
        <button
          disabled={loading}
          onClick={handleUpload}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="animate-spin" size={16} />
          ) : (
            <Upload size={16} />
          )}
          Import Contacts
        </button>
      </div>
    </div>
  );
}
