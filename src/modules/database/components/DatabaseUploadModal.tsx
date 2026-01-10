import { useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useOrganizationStore } from "../../../state/useOrganizationStore";
import {
  detectPhoneKey,
  importTableFile,
  normalizePhoneToE164India,
} from "../../../lib/importTableFile";

type Props = {
  onClose: () => void;
  onSuccess: () => void;
};

type UploadRow = Record<string, string>;

export function DatabaseUploadModal({ onClose, onSuccess }: Props) {
  const { activeOrganization } = useOrganizationStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setLoading(true);

    try {
      if (!activeOrganization?.id) throw new Error("Organization not found");

      const { rows: rawRows, headers } = await importTableFile(file);
      if (!rawRows.length) throw new Error("No rows found");

      const phoneKey = detectPhoneKey(headers);
      if (!phoneKey) {
        throw new Error(
          "No phone/mobile column found. Please include a phone number column (e.g. phone, mobile, mobile no).",
        );
      }

      const upsertRows = rawRows
        .map((r: UploadRow) => {
          const rawPhone = String(r[phoneKey] ?? "").trim();
          const phone = normalizePhoneToE164India(rawPhone);
          if (!phone) return null;

          const first_name =
            (r["first_name"] ?? r["firstname"] ?? r["first name"] ?? "").trim() ||
            null;

          const last_name =
            (r["last_name"] ?? r["lastname"] ?? r["last name"] ?? "").trim() ||
            null;

          const model =
            (r["model"] ?? r["vehicle_model"] ?? r["vehicle model"] ?? "").trim() ||
            null;

          const name = (r["name"] ?? "").trim() || null;

          const metadata: Record<string, string> = { ...r };

          return {
            organization_id: activeOrganization.id,
            phone,
            name,
            first_name,
            last_name,
            model,
            metadata,
          };
        })
        .filter(Boolean) as any[];

      if (!upsertRows.length) throw new Error("No valid phone numbers found");

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
