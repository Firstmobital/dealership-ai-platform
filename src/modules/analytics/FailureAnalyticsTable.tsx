export function FailureAnalyticsTable({ rows }) {
    return (
      <Section title="Failure Reasons">
        <Table>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.failure_reason}</td>
              <td>{r.failure_count}</td>
            </tr>
          ))}
        </Table>
      </Section>
    );
  }

  function Section({ title, children }) {
    return (
      <div className="mb-8">
        <h2 className="text-sm font-semibold mb-2">{title}</h2>
        <div className="bg-slate-900/60 border border-white/10 rounded-xl overflow-hidden">
          {children}
        </div>
      </div>
    );
  }
  
  function Table({ children }) {
    return (
      <table className="w-full text-xs">
        <thead className="bg-slate-800 text-slate-400">
          <tr>
            {Array.from({ length: 6 }).map((_, i) => (
              <th key={i} className="p-2 text-left" />
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">{children}</tbody>
      </table>
    );
  }
  