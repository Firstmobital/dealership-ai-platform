// src/modules/database/DatabaseFilters.tsx

type Filters = {
    phone: string;
    model: string;
    campaign: string;
    status: string;
  };
  
  type Props = {
    filters: Filters;
    setFilters: (updater: (f: Filters) => Filters) => void;
  };
  
  export function DatabaseFilters({ filters, setFilters }: Props) {
    return (
      <div className="flex gap-3 mb-4">
        <input
          placeholder="Search phone"
          value={filters.phone}
          onChange={(e) =>
            setFilters((f) => ({ ...f, phone: e.target.value }))
          }
          className="input"
        />
  
        <input
          placeholder="Model"
          value={filters.model}
          onChange={(e) =>
            setFilters((f) => ({ ...f, model: e.target.value }))
          }
          className="input"
        />
  
        <input
          placeholder="Campaign"
          value={filters.campaign}
          onChange={(e) =>
            setFilters((f) => ({ ...f, campaign: e.target.value }))
          }
          className="input"
        />
  
        <select
          value={filters.status}
          onChange={(e) =>
            setFilters((f) => ({ ...f, status: e.target.value }))
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
  