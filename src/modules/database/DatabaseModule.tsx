// src/modules/database/DatabaseModule.tsx

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import type { ContactCampaignSummary } from "../../types/contactCampaignSummary";
import { DatabaseFilters } from "./DatabaseFilters";
import { ContactsTable } from "./ContactsTable";
import { DatabaseUpload } from "./DatabaseUpload";
import { useOrganizationStore } from "../../state/useOrganizationStore";
import { Upload } from "lucide-react";

/* ------------------------------------------------------------------ */
/* SHARED FILTER TYPE (SINGLE SOURCE OF TRUTH)                         */
/* ------------------------------------------------------------------ */
export type DatabaseFiltersState = {
  phone: string;
  model: string;
  campaign: string;
  status: "all" | "delivered" | "failed" | "never";
};

export function DatabaseModule() {
  const { activeOrganization } = useOrganizationStore();

  const [rows, setRows] = useState<ContactCampaignSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  const [filters, setFilters] = useState<DatabaseFiltersState>({
    phone: "",
    model: "",
    campaign: "",
    status: "all",
  });

  /* -------------------------------------------------------------- */
  /* FETCH DATABASE SUMMARY                                        */
  /* -------------------------------------------------------------- */
  const fetchData = async () => {
    if (!activeOrganization?.id) return;

    setLoading(true);

    const { data, error } = await supabase
      .from("contact_campaign_summary")
      .select("*")
      .eq("organization_id", activeOrganization.id);

    if (error) {
      console.error("[DatabaseModule] fetch error", error);
    } else {
      setRows(data ?? []);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [activeOrganization?.id]);

  /* -------------------------------------------------------------- */
  /* UI                                                           */
  /* -------------------------------------------------------------- */
  return (
    <div className="flex h-full w-full flex-col overflow-hidden px-6 py-6 text-slate-900">
      {/* ========================================================= */}
      {/* HEADER                                                   */}
      {/* ========================================================= */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Database</h1>
          <p className="text-sm text-slate-500">
            Unified contact & campaign performance view
          </p>
        </div>

        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Upload size={16} />
          Upload Contacts
        </button>
      </div>

      {/* ========================================================= */}
      {/* FILTERS                                                  */}
      {/* ========================================================= */}
      <div className="mb-3 rounded-lg border border-slate-200 bg-white p-4">
        <DatabaseFilters
          filters={filters}
          setFilters={setFilters}
        />
      </div>

      {/* ========================================================= */}
      {/* TABLE                                                    */}
      {/* ========================================================= */}
      <div className="flex-1 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <ContactsTable
          rows={rows}
          filters={filters}
          loading={loading}
        />
      </div>

      {/* ========================================================= */}
      {/* UPLOAD MODAL                                             */}
      {/* ========================================================= */}
      {showUpload && (
        <DatabaseUpload
          onClose={() => setShowUpload(false)}
          onDone={async () => {
            setShowUpload(false);
            await fetchData();
          }}
        />
      )}
    </div>
  );
}
