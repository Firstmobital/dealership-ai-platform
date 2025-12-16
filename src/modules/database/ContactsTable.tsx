export function ContactsTable({ rows, filters, loading }) {
    const filtered = rows.filter((r) => {
      if (filters.phone && !r.phone.includes(filters.phone)) return false;
      if (filters.model && r.model !== filters.model) return false;
  
      if (filters.campaign) {
        const all = [
          ...r.delivered_campaigns,
          ...r.failed_campaigns,
        ];
        if (!all.some((c) =>
          c.toLowerCase().includes(filters.campaign.toLowerCase())
        )) return false;
      }
  
      if (filters.status === "delivered" && r.delivered_campaigns.length === 0)
        return false;
  
      if (filters.status === "failed" && r.failed_campaigns.length === 0)
        return false;
  
      if (
        filters.status === "never" &&
        (r.delivered_campaigns.length > 0 ||
          r.failed_campaigns.length > 0)
      )
        return false;
  
      return true;
    });
  
    if (loading) return <div>Loading…</div>;
  
    return (
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th>First</th>
            <th>Last</th>
            <th>Phone</th>
            <th>Model</th>
            <th>Delivered</th>
            <th>Failed</th>
            <th>Action</th>
          </tr>
        </thead>
  
        <tbody>
          {filtered.map((r) => (
            <tr key={r.phone}>
              <td>{r.first_name || "-"}</td>
              <td>{r.last_name || "-"}</td>
              <td>{r.phone}</td>
              <td>{r.model || "-"}</td>
  
              <td className="text-green-400">
                {r.delivered_campaigns.join(", ")}
              </td>
  
              <td className="text-red-400">
                {r.failed_campaigns.join(", ")}
              </td>
  
              <td>
                {r.failed_campaigns.length > 0 && (
                  <button className="text-accent text-xs">
                    Retry
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  