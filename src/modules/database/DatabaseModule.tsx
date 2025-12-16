// src/modules/database/DatabaseModule.tsx

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import type { ContactCampaignSummary } from "../../types/database";
import { DatabaseFilters } from "./DatabaseFilters";
import { ContactsTable } from "./ContactsTable";
import { DatabaseUpload } from "./DatabaseUpload";
import { useOrganizationStore } from "../../state/useOrganizationStore";
import { Upload } from "lucide-react";

/* ------------------------------------------------------------------ */
/* SHARED FILTER TYPE (single source of truth)                         */
/* ------------------------------------------------------------------ */

export type DatabaseFiltersState = {
  phone: string;
  model: string;
  campaign: string;
  status: "all" | "delivered" | "failed" | "never";
};

export function DatabaseModule() {
  const { currentOrganization } = useOrganizationStore();

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
    if (!currentOrganization?.id) return;

    setLoading(true);

    const { data, error } = await supabase
      .from("contact_campaign_summary")
      .select("*")
      .eq("organization_id", currentOrganization.id);

    if (error) {
      console.error("[DatabaseModule] fetch error", error);
    } else {
      setRows(data ?? []);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [currentOrganization?.id]);

  /* -------------------------------------------------------------- */
  /* UI                                                           */
  /* -------------------------------------------------------------- */
  return (
    <div className="h-full w-full p-4 flex flex-col overflow-hidden">
      {/* ========================================================= */}
      {/* HEADER + ACTIONS                                         */}
      {/* ========================================================= */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-sm font-semibold text-white">Database</h1>

        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 bg-accent px-3 py-1.5 rounded-lg text-sm text-white hover:bg-accent/90"
        >
          <Upload size={14} />
          Upload Contacts
        </button>
      </div>

      {/* ========================================================= */}
      {/* FILTERS                                                  */}
      {/* ========================================================= */}
      <DatabaseFilters
        filters={filters}
        setFilters={setFilters}
      />

      {/* ========================================================= */}
      {/* TABLE                                                    */}
      {/* ========================================================= */}
      <div className="flex-1 overflow-hidden mt-3">
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
            await fetchData(); // 🔥 refresh after upload
          }}
        />
      )}
    </div>
  );
}