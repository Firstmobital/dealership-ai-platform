// src/modules/database/DatabaseFilters.tsx

import type { Dispatch, SetStateAction } from "react";
import type { DatabaseFiltersState } from "./DatabaseModule";

type Props = {
  filters: DatabaseFiltersState;
  setFilters: Dispatch<SetStateAction<DatabaseFiltersState>>;
};

export function DatabaseFilters({ filters, setFilters }: Props) {
  return (
    <div className="flex gap-3 mb-4">
      <input
        placeholder="Search phone"
        value={filters.phone}
        onChange={(e) =>
          setFilters((prev) => ({ ...prev, phone: e.target.value }))
        }
        className="input"
      />

      <input
        placeholder="Model"
        value={filters.model}
        onChange={(e) =>
          setFilters((prev) => ({ ...prev, model: e.target.value }))
        }
        className="input"
      />

      <input
        placeholder="Campaign"
        value={filters.campaign}
        onChange={(e) =>
          setFilters((prev) => ({ ...prev, campaign: e.target.value }))
        }
        className="input"
      />

      <select
        value={filters.status}
        onChange={(e) =>
          setFilters((prev) => ({
            ...prev,
            status: e.target.value as DatabaseFiltersState["status"],
          }))
        }
        className="input"
      >
        <option value="all">All</option>
        <option value="delivered">Delivered</option>
        <option value="failed">Failed</option>
        <option value="never">Never Sent</option>
      </select>
    </div>
  );
}
