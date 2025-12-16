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

export function DatabaseUpload({ onClose, onDone }: {
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
        }
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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-slate-900 w-[600px] rounded-xl p-4 border border-white/10">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-sm font-semibold">Upload Contacts</h2>
          <button onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <textarea
          className="w-full h-32 bg-slate-800 rounded p-2 text-xs font-mono"
          placeholder="Paste CSV here (must include phone column)"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
        />

        <div className="flex gap-2 mt-2">
          <button
            onClick={handleParse}
            className="px-3 py-1 bg-slate-700 rounded text-xs"
          >
            Preview
          </button>

          <input
            placeholder="Optional tag (eg: legacy_import)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="flex-1 px-2 py-1 bg-slate-800 rounded text-xs"
          />
        </div>

        {preview.length > 0 && (
          <div className="mt-3 border border-white/10 rounded">
            <table className="w-full text-xs">
              <thead className="bg-slate-800">
                <tr>
                  {Object.keys(preview[0]).map((h) => (
                    <th key={h} className="p-1 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i} className="odd:bg-slate-800/50">
                    {Object.values(r).map((v, j) => (
                      <td key={j} className="p-1">{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button
          disabled={loading}
          onClick={handleUpload}
          className="mt-4 w-full bg-accent py-2 rounded flex justify-center gap-2"
        >
          {loading ? <Loader2 className="animate-spin" size={14} /> : <Upload size={14} />}
          Import Contacts
        </button>
      </div>
    </div>
  );
}
