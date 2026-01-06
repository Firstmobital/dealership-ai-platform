import { useState } from "react";
import Papa, { ParseResult } from "papaparse";
import { supabase } from "../../../lib/supabaseClient";
import { useOrganizationStore } from "../../../state/useOrganizationStore";

/* -------------------------------------------------------------------------- */
/* PROPS                                                                      */
/* -------------------------------------------------------------------------- */
type Props = {
  onClose: () => void;
  onSuccess: () => void;
};

/* -------------------------------------------------------------------------- */
/* CSV ROW TYPE                                                               */
/* -------------------------------------------------------------------------- */
type UploadRow = {
  phone: string;
  first_name?: string;
  last_name?: string;
  model?: string;
};

/* -------------------------------------------------------------------------- */
/* COMPONENT                                                                  */
/* -------------------------------------------------------------------------- */
export function DatabaseUploadModal({ onClose, onSuccess }: Props) {
  const { currentOrganization } = useOrganizationStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setLoading(true);

    Papa.parse<UploadRow>(file, {
      header: true,
      skipEmptyLines: true,

      complete: async (result: ParseResult<UploadRow>) => {
        try {
          if (!currentOrganization?.id) {
            throw new Error("Organization not found");
          }

          const rows = result.data
            .filter((r): r is UploadRow => !!r.phone)
            .map((r) => ({
              phone: r.phone.trim(),
              first_name: r.first_name?.trim() || null,
              last_name: r.last_name?.trim() || null,
              model: r.model?.trim() || null,
              organization_id: currentOrganization.id,
            }));

          if (rows.length === 0) {
            throw new Error("No valid rows found");
          }

          const { error } = await supabase
            .from("contacts")
            .upsert(rows, { onConflict: "organization_id,phone" });

          if (error) throw error;

          onSuccess();
          onClose();
        } catch (err) {
          const message =
            err instanceof Error
              ? err.message
              : "Upload failed";
          setError(message);
        } finally {
          setLoading(false);
        }
      },
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[420px] rounded-lg bg-white p-6">
        <h2 className="mb-2 text-lg font-semibold">
          Upload Contacts
        </h2>

        <p className="mb-4 text-sm text-slate-500">
          CSV format only. Required column: <b>phone</b>
        </p>

        <input
          type="file"
          accept=".csv"
          disabled={loading}
          onChange={(e) => {
            if (e.target.files?.[0]) {
              handleFile(e.target.files[0]);
            }
          }}
        />

        {error && (
          <p className="mt-3 text-sm text-red-600">
            {error}
          </p>
        )}

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
