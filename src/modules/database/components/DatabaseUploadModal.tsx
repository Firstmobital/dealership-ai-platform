import { useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useOrganizationStore } from "../../../state/useOrganizationStore";
import { parseUploadFile } from "../../../lib/uploadParse";


type Props = {
  onClose: () => void;
  onSuccess: () => void;
};


export function DatabaseUploadModal({ onClose, onSuccess }: Props) {
  const { activeOrganization } = useOrganizationStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setLoading(true);
  
    try {
      if (!activeOrganization?.id) {
        throw new Error("Organization not found");
      }
  
      const { rows } = await parseUploadFile(file);
  
      const upsertRows = rows.map((r) => ({
        organization_id: activeOrganization.id,
        phone: r.phone,
        metadata: r.raw_row,
      }));
  
      if (!upsertRows.length) {
        throw new Error("No valid phone numbers found");
      }
  
      const { error } = await supabase
        .from("contacts")
        .upsert(upsertRows, { onConflict: "organization_id,phone" });
  
      if (error) throw error;
  
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }
  

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[420px] rounded-lg bg-white p-6">
        <h2 className="mb-2 text-lg font-semibold">Upload Contacts</h2>

        <p className="mb-4 text-sm text-slate-500">
          Upload CSV or Excel. Phone column can be named phone/mobile/mobile no.
        </p>

        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          disabled={loading}
          onChange={(e) => {
            if (e.target.files?.[0]) void handleFile(e.target.files[0]);
          }}
        />

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-md border px-4 py-2 text-sm"
          >
            Cancel
          </button>

          <button
            disabled
            className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white opacity-60"
          >
            {loading ? "Uploading…" : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}
