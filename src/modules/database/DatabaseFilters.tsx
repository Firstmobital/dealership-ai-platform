// src/modules/database/DatabaseFilters.tsx
// FULL + FINAL — Tier 5
// Clean CRM-style filter bar
// Logic untouched

import type { Dispatch, SetStateAction } from "react";
import type { DatabaseFiltersState } from "./DatabaseModule";

type Props = {
  filters: DatabaseFiltersState;
  setFilters: Dispatch<SetStateAction<DatabaseFiltersState>>;
};

export function DatabaseFilters({ filters, setFilters }: Props) {
  const inputClass =
    "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {/* Phone */}
      <input
        placeholder="Search phone"
        value={filters.phone}
        onChange={(e) =>
          setFilters((prev) => ({ ...prev, phone: e.target.value }))
        }
        className={inputClass}
      />

      {/* Model */}
      <input
        placeholder="Model"
        value={filters.model}
        onChange={(e) =>
          setFilters((prev) => ({ ...prev, model: e.target.value }))
        }
        className={inputClass}
      />

      {/* Campaign */}
      <input
        placeholder="Campaign"
        value={filters.campaign}
        onChange={(e) =>
          setFilters((prev) => ({ ...prev, campaign: e.target.value }))
        }
        className={inputClass}
      />

      {/* Status */}
      <select
        value={filters.status}
        onChange={(e) =>
          setFilters((prev) => ({
            ...prev,
            status: e.target.value as DatabaseFiltersState["status"],
          }))
        }
        className={inputClass}
      >
        <option value="all">All statuses</option>
        <option value="delivered">Delivered</option>
        <option value="failed">Failed</option>
        <option value="never">Never sent</option>
      </select>
    </div>
  );
}
